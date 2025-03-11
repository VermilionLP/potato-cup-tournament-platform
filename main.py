import requests
import json
from datetime import datetime
from typing import Dict, List, Optional
import os
from config import API_KEY, BNET_CONFIG, REPLAY_FILE, OUTPUT_FILE

class TournamentAnalyzer:
    def __init__(self, api_key: str, battlenet_config_path: str, subdomain: str = None):
        """Initialize with Challonge API key, Battle.net config path, and optional subdomain"""
        self.api_key = api_key
        self.base_url = "https://api.challonge.com/v1"
        self.subdomain = subdomain
        self.battlenet_ids = self._load_battlenet_config(battlenet_config_path)
        self.results = {}

    def _load_battlenet_config(self, config_path: str) -> List[Dict]:
        """Load Battle.net IDs from config file"""
        if not os.path.exists(config_path):
            raise FileNotFoundError(f"Battle.net config file not found at {config_path}")
        
        with open(config_path, 'r', encoding='utf-8') as f:
            return json.load(f)  # Expects list of player dicts from replayreader.py

    def _get_params(self) -> Dict:
        """Generate common query parameters"""
        params = {"api_key": self.api_key, "state": "all"}
        if self.subdomain:
            params["subdomain"] = self.subdomain
        return params

    def get_tournament_list(self) -> List[Dict]:
        """Fetch list of all tournaments using v1 API"""
        url = f"{self.base_url}/tournaments.json"
        params = self._get_params()
        response = requests.get(url, params=params)
        
        if response.status_code != 200:
            raise Exception(f"Failed to fetch tournament list: {response.status_code} - {response.text}")
        
        return [item["tournament"] for item in response.json()]

    def print_tournament_list(self) -> None:
        """Print list of tournaments with ID and name"""
        tournaments = self.get_tournament_list()
        print("\nAvailable Tournaments:")
        print("-" * 50)
        for tournament in tournaments:
            t_id = tournament['id']
            name = tournament['name']
            print(f"ID: {t_id} | Name: {name}")
        print("-" * 50)

    def get_tournament_info(self, tournament_id: str, include_extras: bool = False) -> Dict:
        """Fetch tournament information from Challonge v1 API"""
        url = f"{self.base_url}/tournaments/{tournament_id}.json"
        params = self._get_params()
        if include_extras:
            params["include_participants"] = 1
            params["include_matches"] = 1
        response = requests.get(url, params=params)
        
        if response.status_code != 200:
            raise Exception(f"Failed to fetch tournament: {response.status_code} - {response.text}")
        
        return response.json()["tournament"]

    def get_matches(self, tournament_id: str) -> List[Dict]:
        """Fetch all matches for a tournament using v1 API"""
        url = f"{self.base_url}/tournaments/{tournament_id}/matches.json"
        params = self._get_params()
        response = requests.get(url, params=params)
        
        if response.status_code != 200:
            raise Exception(f"Failed to fetch matches: {response.status_code} - {response.text}")
        
        return [item["match"] for item in response.json()]

    def get_participants(self, tournament_id: str) -> Dict[str, str]:
        """Fetch participants and map their IDs to names using v1 API"""
        url = f"{self.base_url}/tournaments/{tournament_id}/participants.json"
        params = self._get_params()
        response = requests.get(url, params=params)
        
        if response.status_code != 200:
            raise Exception(f"Failed to fetch participants: {response.status_code} - {response.text}")
        
        participants = {}
        for participant in response.json():
            participant_data = participant["participant"]
            participant_id = str(participant_data['id'])
            name = participant_data['name']
            participants[participant_id] = name
        return participants

    def print_participants(self, tournament_id: str) -> None:
        """Print list of participants with ID and name"""
        participants = self.get_participants(tournament_id)
        print("\nTournament Participants:")
        print("-" * 50)
        for participant_id, name in participants.items():
            print(f"ID: {participant_id} | Name: {name}")
        print("-" * 50)

    def process_replay_data(self, replay_file: str) -> Dict:
        """Process SC2 replay file, aggregating data from multiple replays"""
        with open(replay_file, 'r', encoding='utf-8') as f:
            replay_data_list = json.load(f)
        
        player_races = {}
        for replay in replay_data_list:
            for player in replay["players"]:
                player_races[player["name"]] = player["actual_race"]
        
        match_start = replay_data_list[0]["start_time"] if replay_data_list else datetime.now().isoformat()
        
        return {
            'player_races': player_races,
            'match_start': match_start
        }

    def analyze_tournament(self, tournament_id: str, replay_file: str) -> Dict:
        """Analyze tournament and integrate with replay data"""
        tournament_info = self.get_tournament_info(tournament_id, include_extras=True)
        participants = {str(p["participant"]["id"]): p["participant"]["name"] 
                       for p in tournament_info.get("participants", [])}
        matches = [m["match"] for m in tournament_info.get("matches", [])]
        replay_data = self.process_replay_data(replay_file)

        self.results = {
            'tournament_name': tournament_info['name'],
            'tournament_id': tournament_id,
            'matches': [],
            'players': {}
        }

        for match in matches:
            player1_id = str(match.get('player1_id')) if match.get('player1_id') else None
            player2_id = str(match.get('player2_id')) if match.get('player2_id') else None
            
            if not player1_id or not player2_id:
                continue

            player1_name = participants.get(player1_id, "Unknown")
            player2_name = participants.get(player2_id, "Unknown")

            # Match with Battle.net data using challonge_names
            player1_bnet = next((p for p in self.battlenet_ids if player1_name in p["challonge_names"]), None)
            player2_bnet = next((p for p in self.battlenet_ids if player2_name in p["challonge_names"]), None)

            scores_csv = match.get('scores_csv', "0-0")
            scores = scores_csv.split('-')
            score1 = int(scores[0].strip()) if scores else 0
            score2 = int(scores[1].strip()) if len(scores) > 1 else 0

            # Handle round-robin scoring (e.g., Bo2 with W-3pts, D-1pt, L-0pt)
            if tournament_info['tournament_type'] == "round robin":
                if score1 > score2:
                    total_score1, total_score2 = 3, 0  # Win: 3 points, Loss: 0 points
                elif score1 < score2:
                    total_score1, total_score2 = 0, 3
                else:
                    total_score1, total_score2 = 1, 1  # Tie: 1 point each
            else:  # Single elimination or other formats
                total_score1, total_score2 = score1, score2

            for player_name, bnet, score, total_score in [
                (player1_name, player1_bnet, score1, total_score1),
                (player2_name, player2_bnet, score2, total_score2)
            ]:
                if player_name not in self.results['players']:
                    bnet_id = bnet["battle_net_name"] if bnet else "Unknown"
                    bnet_url = bnet["battle_net_url"] if bnet else "Unknown"
                    self.results['players'][player_name] = {
                        'battlenet_id': bnet_id,
                        'battlenet_url': bnet_url,
                        'race': replay_data['player_races'].get(player_name, "Unknown"),
                        'total_score': 0,
                        'matches_played': 0
                    }
                self.results['players'][player_name]['total_score'] += total_score
                self.results['players'][player_name]['matches_played'] += 1

            match_entry = {
                'match_id': match['id'],
                'player1': {
                    'name': player1_name,
                    'battlenet_id': player1_bnet["battle_net_name"] if player1_bnet else "Unknown",
                    'score': score1,
                    'total_score': total_score1,
                    'race': replay_data['player_races'].get(player1_name, "Unknown")
                },
                'player2': {
                    'name': player2_name,
                    'battlenet_id': player2_bnet["battle_net_name"] if player2_bnet else "Unknown",
                    'score': score2,
                    'total_score': total_score2,
                    'race': replay_data['player_races'].get(player2_name, "Unknown")
                },
                'start_time': match.get('started_at', replay_data['match_start']),
                'state': match['state'],
                'winner_id': str(match['winner_id']) if match.get('winner_id') else None,
                'round': match['round'],
                'identifier': match['identifier']
            }
            self.results['matches'].append(match_entry)

        return self.results

    def save_results(self, output_path: str):
        """Save results to a JSON file"""
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(self.results, f, indent=2, ensure_ascii=False)

def main():
    # Initialize analyzer (set subdomain if needed)
    analyzer = TournamentAnalyzer(API_KEY, BNET_CONFIG, subdomain=None)

    # Print tournament list and get user input
    analyzer.print_tournament_list()
    user_input = input("Enter the tournament ID you want to analyze (add '-p' to print participants only): ").strip()

    parts = user_input.split()
    tournament_id = parts[0]
    print_participants_only = '-p' in parts

    if print_participants_only:
        analyzer.print_participants(tournament_id)
    else:
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