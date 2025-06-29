import requests
import json
from datetime import datetime
from typing import Dict, List, Optional
import os
import sc2reader
from config import API_KEY, REPLAY_FILE, OUTPUT_FILE

class TournamentAnalyzer:
    def __init__(self, api_key: str):
        """Initialize with Challonge API key"""
        self.api_key = api_key
        self.base_url = "https://api.challonge.com/v2.1"
        self.headers = {
            "Authorization": f"ApiKey {api_key}",
            "Content-Type": "application/vnd.api+json",
            "Accept": "application/json",
            "Authorization-Type": "v1"
        }
        self.results = {}

    def get_tournament_list(self) -> List[Dict]:
        """Fetch list of all tournaments"""
        url = f"{self.base_url}/tournaments.json"
        response = requests.get(url, headers=self.headers)
        if response.status_code != 200:
            raise Exception(f"Failed to fetch tournament list: {response.status_code} - {response.text}")
        return response.json()

    def print_tournament_list(self) -> None:
        """Print list of tournaments with ID and name"""
        tournaments = self.get_tournament_list()
        print("\nAvailable Tournaments:")
        print("-" * 50)
        for tournament in tournaments:
            t_id = tournament['id']
            name = tournament['attributes']['name']
            print(f"ID: {t_id} | Name: {name}")
        print("-" * 50)

    def get_tournament_info(self, tournament_id: str) -> Dict:
        """Fetch tournament information from Challonge"""
        url = f"{self.base_url}/tournaments/{tournament_id}.json"
        response = requests.get(url, headers=self.headers)
        if response.status_code != 200:
            raise Exception(f"Failed to fetch tournament: {response.status_code} - {response.text}")
        return response.json()['data']

    def get_matches(self, tournament_id: str) -> List[Dict]:
        """Fetch all matches for a tournament"""
        url = f"{self.base_url}/tournaments/{tournament_id}/matches.json"
        response = requests.get(url, headers=self.headers)
        if response.status_code != 200:
            raise Exception(f"Failed to fetch matches: {response.status_code} - {response.text}")
        return response.json()

    def get_participants(self, tournament_id: str) -> Dict[str, str]:
        """Fetch participants and map their IDs to names"""
        url = f"{self.base_url}/tournaments/{tournament_id}/participants.json"
        response = requests.get(url, headers=self.headers)
        if response.status_code != 200:
            raise Exception(f"Failed to fetch participants: {response.status_code} - {response.text}")
        participants = {}
        for participant in response.json():
            participant_id = participant['id']
            name = participant['attributes']['name']
            participants[participant_id] = name
        return participants

    def generate_sc2_replay_data(self, replay_file: str, output_path: str = "sc2_replay_data.json"):
        """Generate SC2 replay data from a replay file"""
        replay = sc2reader.load_replay(replay_file)
        
        # Extract data from replay
        players = []
        for player in replay.players:
            picked_race = player.pick_race  # Race chosen at start (e.g., Random)
            actual_race = player.play_race  # Actual race played
            battle_net_url = getattr(player, 'url', None)  # Battle.net URL if available
            players.append({
                "name": player.name,
                "battle_net_url": battle_net_url if battle_net_url else f"https://starcraft2.com/profile/{player.pid}",
                "picked_race": picked_race,
                "actual_race": actual_race
            })

        # Determine winner (assuming team-based victory)
        winner = replay.winner.players[0].name if replay.winner else "Unknown"

        replay_data = {
            "winner": winner,
            "start_time": replay.start_time.isoformat(),
            "players": players,
            "map_name": replay.map_name
        }

        with open(output_path, 'w') as f:
            json.dump(replay_data, f, indent=2)
        print(f"SC2 replay data saved to {output_path}")

    def generate_battlenet_ids(self, tournament_id: str, replay_file: str, output_path: str = "battlenet_ids.json"):
        """Generate initial battlenet_ids.json from Challonge and SC2 replay data"""
        # Get participants from Challonge
        participants = self.get_participants(tournament_id)
        
        # Load replay data
        replay = sc2reader.load_replay(replay_file)
        sc2_players = {player.name: {
            "starcraft_name": player.name,
            "battle_net_name": player.name.split('#')[0] if '#' in player.name else player.name,
            "battle_net_url": getattr(player, 'url', f"https://starcraft2.com/profile/{player.pid}")
        } for player in replay.players}

        # Combine data
        player_data = []
        for participant_id, challonge_name in participants.items():
            # Try to match with SC2 player (this may need manual adjustment)
            matched_sc2_player = None
            for sc2_name, sc2_info in sc2_players.items():
                if sc2_name.lower() in challonge_name.lower() or challonge_name.lower() in sc2_name.lower():
                    matched_sc2_player = sc2_info
                    break

            player_entry = {
                "challonge_names": [challonge_name],  # Array for multiple possible names
                "challonge_id": participant_id,
                "starcraft_name": matched_sc2_player["starcraft_name"] if matched_sc2_player else "TBD",
                "battle_net_name": matched_sc2_player["battle_net_name"] if matched_sc2_player else "TBD",
                "battle_net_url": matched_sc2_player["battle_net_url"] if matched_sc2_player else "TBD"
            }
            player_data.append(player_entry)

        with open(output_path, 'w') as f:
            json.dump(player_data, f, indent=2)
        print(f"Initial battlenet_ids.json saved to {output_path}")
        print("Note: Please manually verify and update names and URLs as needed.")

    def load_battlenet_ids(self, config_path: str) -> List[Dict]:
        """Load Battle.net IDs from config file"""
        if not os.path.exists(config_path):
            raise FileNotFoundError(f"Battle.net config file not found at {config_path}")
        with open(config_path, 'r') as f:
            return json.load(f)

    def analyze_tournament(self, tournament_id: str, replay_file: str) -> Dict:
        """Analyze tournament with updated replay data"""
        tournament_info = self.get_tournament_info(tournament_id)
        participants = self.get_participants(tournament_id)
        matches = self.get_matches(tournament_id)
        battlenet_ids = self.load_battlenet_ids("battlenet_ids.json")
        replay = sc2reader.load_replay(replay_file)

        self.results = {
            'tournament_name': tournament_info['attributes']['name'],
            'tournament_id': tournament_id,
            'matches': [],
            'players': {}
        }

        # Map Battle.net data by StarCraft name
        bnet_map = {player["starcraft_name"]: player for player in battlenet_ids}

        for match in matches:
            match_data = match['attributes']
            player1_id = match_data.get('relationships', {}).get('player1', {}).get('data', {}).get('id')
            player2_id = match_data.get('relationships', {}).get('player2', {}).get('data', {}).get('id')
            if not player1_id or not player2_id:
                continue

            player1_name = participants.get(player1_id, "Unknown")
            player2_name = participants.get(player2_id, "Unknown")

            # Match Challonge names to Battle.net data
            player1_bnet = next((p for p in battlenet_ids if player1_name in p["challonge_names"]), None)
            player2_bnet = next((p for p in battlenet_ids if player2_name in p["challonge_names"]), None)

            scores = match_data.get('scores', "0-0").split('-')
            score1 = int(scores[0].strip()) if scores else 0
            score2 = int(scores[1].strip()) if len(scores) > 1 else 0

            for player_name, bnet, score in [
                (player1_name, player1_bnet, score1),
                (player2_name, player2_bnet, score2)
            ]:
                if player_name not in self.results['players']:
                    sc2_player = next((p for p in replay.players if p.name == (bnet["starcraft_name"] if bnet else "")), None)
                    self.results['players'][player_name] = {
                        'battlenet_id': bnet["battle_net_name"] if bnet else "Unknown",
                        'battlenet_url': bnet["battle_net_url"] if bnet else "Unknown",
                        'picked_race': sc2_player.pick_race if sc2_player else "Unknown",
                        'actual_race': sc2_player.play_race if sc2_player else "Unknown",
                        'total_score': 0,
                        'matches_played': 0
                    }
                self.results['players'][player_name]['total_score'] += score
                self.results['players'][player_name]['matches_played'] += 1

            match_entry = {
                'match_id': match['id'],
                'player1': {
                    'name': player1_name,
                    'battlenet_id': player1_bnet["battle_net_name"] if player1_bnet else "Unknown",
                    'battlenet_url': player1_bnet["battle_net_url"] if player1_bnet else "Unknown",
                    'score': score1,
                    'picked_race': next((p.pick_race for p in replay.players if p.name == (player1_bnet["starcraft_name"] if player1_bnet else "")), "Unknown"),
                    'actual_race': next((p.play_race for p in replay.players if p.name == (player1_bnet["starcraft_name"] if player1_bnet else "")), "Unknown")
                },
                'player2': {
                    'name': player2_name,
                    'battlenet_id': player2_bnet["battle_net_name"] if player2_bnet else "Unknown",
                    'battlenet_url': player2_bnet["battle_net_url"] if player2_bnet else "Unknown",
                    'score': score2,
                    'picked_race': next((p.pick_race for p in replay.players if p.name == (player2_bnet["starcraft_name"] if player2_bnet else "")), "Unknown"),
                    'actual_race': next((p.play_race for p in replay.players if p.name == (player2_bnet["starcraft_name"] if player2_bnet else "")), "Unknown")
                },
                'start_time': replay.start_time.isoformat(),
                'map_name': replay.map_name,
                'state': match_data['state'],
                'winner_id': match_data.get('winner_id')
            }
            self.results['matches'].append(match_entry)

        return self.results

    def save_results(self, output_path: str):
        """Save results to a JSON file"""
        with open(output_path, 'w') as f:
            json.dump(self.results, f, indent=2)

def main():
    # Initialize analyzer
    analyzer = TournamentAnalyzer(API_KEY)
    
    # Generate initial JSON files if they don’t exist
    if not os.path.exists("sc2_replay_data.json"):
        analyzer.generate_sc2_replay_data(REPLAY_FILE)
    
    # Print tournament list and get user input
    analyzer.print_tournament_list()
    tournament_id = input("Enter the tournament ID you want to analyze: ").strip()
    
    if not os.path.exists("battlenet_ids.json"):
        analyzer.generate_battlenet_ids(tournament_id, REPLAY_FILE)
        print("Please update battlenet_ids.json with correct names and URLs, then re-run the script.")
        return

    # Analyze tournament
    try:
        results = analyzer.analyze_tournament(tournament_id, REPLAY_FILE)
        analyzer.save_results(OUTPUT_FILE)
        print(f"Results saved to {OUTPUT_FILE}")
        print(f"Tournament: {results['tournament_name']}")
        print(f"Total matches: {len(results['matches'])}")
        print(f"Total players: {len(results['players'])}")
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    main()