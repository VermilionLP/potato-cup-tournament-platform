import sys
import os
from pathlib import Path
from datetime import datetime, timedelta
import argparse
import sc2reader
from concurrent.futures import ThreadPoolExecutor
import logging
import json


# Configuration class
class ReplayConfig:
    TIME_OFFSET = timedelta(hours=8)
    FILE_EXTENSION = ".SC2Replay"
    LOAD_LEVEL = 2
    MAX_WORKERS = 4  # Adjust based on your CPU


# Set up logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="SC2 Replay Processor and JSON Generator"
    )
    parser.add_argument(
        "path", nargs="?", default=os.getcwd(), help="Directory containing SC2 replays"
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Show changes without renaming files"
    )
    parser.add_argument("--verbose", action="store_true", help="Show detailed output")
    return parser.parse_args()


def list_dir(path):
    """List all SC2 replay files in directory."""
    try:
        return [
            p
            for p in Path(path).iterdir()
            if p.is_file() and p.suffix.lower() == ReplayConfig.FILE_EXTENSION.lower()
        ]
    except Exception as e:
        logger.error(f"Error listing directory {path}: {str(e)}")
        return []


def format_teams(replay):
    """Format team information for replay."""
    return " vs ".join(
        "+".join(f"{player.name}({player.pick_race[0]})" for player in team)
        for team in replay.teams
    )


def format_replay(replay, config=ReplayConfig):
    """Format replay filename."""
    timestamp = (replay.start_time + config.TIME_OFFSET).strftime("%Y-%m-%d %H-%M-%S")
    return f"{timestamp} {replay.category} {replay.type} {format_teams(replay)} on {replay.map_name}"


def process_replay_file(replay_path, path, dry_run=False, config=ReplayConfig):
    """Process a single replay file and return data for JSON generation."""
    try:
        # Validate file
        if not replay_path.exists():
            logger.warning(f"File not found: {replay_path}")
            return None

        replay = sc2reader.load_replay(str(replay_path), load_level=config.LOAD_LEVEL)
        new_name = format_replay(replay, config)
        new_path = path / f"{new_name}{config.FILE_EXTENSION}"

        logger.info(f"Processing: {replay_path.name} -> {new_name}")

        if not dry_run:
            if new_path.exists():
                logger.warning(f"Skipping: {new_name} already exists")
            else:
                replay_path.rename(new_path)
                logger.info(f"Successfully renamed to: {new_name}")

        # Collect replay data
        players = []
        for player in replay.players:
            battle_net_url = getattr(
                player, "url", f"https://starcraft2.com/profile/{player.pid}"
            )
            players.append(
                {
                    "name": player.name,
                    "battle_net_url": battle_net_url,
                    "picked_race": player.pick_race,
                    "actual_race": player.play_race,
                }
            )

        winner = (
            replay.winner.players[0].name
            if replay.winner and replay.winner.players
            else "Unknown"
        )

        return {
            "winner": winner,
            "start_time": replay.start_time.isoformat(),
            "players": players,
            "map_name": replay.map_name,
        }

    except Exception as e:
        logger.error(f"Error processing {replay_path}: {str(e)}")
        return None


def generate_sc2_replay_data(
    replay_data_list, output_path="./.cache/sc2_replay_data.json"
):
    """Generate sc2_replay_data.json from processed replay data with actual characters."""
    os.makedirs("./cache", exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(
            replay_data_list, f, indent=2, ensure_ascii=False
        )  # Ensure actual characters
    logger.info(f"SC2 replay data saved to {output_path}")


def generate_battlenet_ids(replay_data_list, output_path="./.cache/battlenet_ids.json"):
    """Generate initial battlenet_ids.json from replay data with actual characters,
    and avoid duplicates by checking existing battle_net_url."""
    os.makedirs('./cache', exist_ok=True)
    existing_players = {}
    if os.path.exists(output_path):
        with open(output_path, 'r', encoding='utf-8') as f:
            existing_data = json.load(f)
            for player in existing_data:
                existing_players[player["battle_net_url"]] = player

    for replay_data in replay_data_list:
        for player in replay_data["players"]:
            battle_net_url = player["battle_net_url"]
            if battle_net_url not in existing_players:
                existing_players[battle_net_url] = {
                    "challonge_names": [],
                    "challonge_id": "TBD",
                    "starcraft_name": player["name"],
                    "battle_net_url": battle_net_url
                }

    player_data = list(existing_players.values())

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(player_data, f, indent=2, ensure_ascii=False)  # Ensure actual characters
    logger.info(f"Initial battlenet_ids.json saved to {output_path}")
    logger.info("Note: Please manually update challonge_names and challonge_id fields.")


def main():
    """Main function to process replay files and generate JSON files."""
    args = parse_args()
    if args.verbose:
        logger.setLevel(logging.DEBUG)

    path = Path(args.path)

    if not path.exists():
        logger.error(f"Directory does not exist: {path}")
        sys.exit(1)

    if not path.is_dir():
        logger.error(f"Path is not a directory: {path}")
        sys.exit(1)

    replay_files = list_dir(path)
    if not replay_files:
        logger.warning(f"No replay files found in {path}")
        return

    logger.info(f"Found {len(replay_files)} replay files to process")

    # Process files in parallel and collect data
    replay_data_list = []
    with ThreadPoolExecutor(max_workers=ReplayConfig.MAX_WORKERS) as executor:
        results = list(
            executor.map(
                lambda p: process_replay_file(p, path, args.dry_run), replay_files
            )
        )
        replay_data_list = [r for r in results if r is not None]

    # Summary
    successes = len(replay_data_list)
    logger.info(
        f"Processing complete: {successes}/{len(replay_files)} files processed successfully"
    )

    if replay_data_list:
        # Generate JSON files
        path_name = path.name
        output_folder = Path("./.cache")
        output_folder.mkdir(exist_ok=True)
        sc2_replay_output_path = output_folder / f"replay_dat_{path_name}.json"

        generate_sc2_replay_data(replay_data_list, output_path=sc2_replay_output_path)
        generate_battlenet_ids(replay_data_list)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.info("Process interrupted by user")
        sys.exit(0)
    except Exception as e:
        logger.error(f"Critical error: {str(e)}")
        sys.exit(1)
