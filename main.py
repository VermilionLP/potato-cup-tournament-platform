import requests
import json
from datetime import datetime
from typing import Dict, List, Optional
import os

class TournamentAnalyzer:
    def __init__(self, api_key: str, battlenet_config_path: str):
        """Initialize with Challonge API key and Battle.net ID config path"""
        self.api_key = api_key
        self.base_url = "https://api.challonge.com/v2.1"
        self.headers = {
            "Authorization": f"ApiKey {api_key}",
            "Content-Type": "application/vnd.api+json",
            "Accept": "application/json",
            "Authorization-Type": "v1"
        }
        self.battlenet_ids = self._load_battlenet_config(battlenet_config_path)
        self.results = {}

    def _load_battlenet_config(self, config_path: str) -> Dict[str, str]:
        """Load Battle.net IDs from config file"""
        if not os.path.exists(config_path):
            raise FileNotFoundError(f"Battle.net config file not found at {config_path}")
        
        with open(config_path, 'r') as f:
            return json.load(f)  # Expected format: {"player_name": "battlenet_id"}

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

    def process_replay_data(self, replay_file: str) -> Dict:
        """Process SC2 replay file - placeholder for your replay processing logic"""
        with open(replay_file, 'r') as f:
            replay_data = json.load(f)
        
        return {
            'player_races': replay_data.get('player_races', {}),
            'match_start': replay_data.get('timestamp', datetime.now().isoformat())
        }

    def analyze_tournament(self, tournament_id: str, replay_file: str) -> Dict:
        """Main method to analyze tournament and integrate all data"""
        tournament_info = self.get_tournament_info(tournament_id)
        participants = self.get_participants(tournament_id)
        matches = self.get_matches(tournament_id)
        replay_data = self.process_replay_data(replay_file)

        self.results = {
            'tournament_name': tournament_info['attributes']['name'],
            'tournament_id': tournament_id,
            'matches': [],
            'players': {}
        }

        for match in matches:
            match_data = match['attributes']
            player1_id = match_data.get('relationships', {}).get('player1', {}).get('data', {}).get('id')
            player2_id = match_data.get('relationships', {}).get('player2', {}).get('data', {}).get('id')
            
            if not player1_id or not player2_id:
                continue

            player1_name = participants.get(player1_id, "Unknown")
            player2_name = participants.get(player2_id, "Unknown")

            player1_bnet = self.battlenet_ids.get(player1_name)
            player2_bnet = self.battlenet_ids.get(player2_name)

            scores = match_data.get('scores', "0-0").split('-')
            score1 = int(scores[0].strip()) if scores else 0
            score2 = int(scores[1].strip()) if len(scores) > 1 else 0

            for player_name, bnet, score in [
                (player1_name, player1_bnet, score1),
                (player2_name, player2_bnet, score2)
            ]:
                if player_name not in self.results['players']:
                    self.results['players'][player_name] = {
                        'battlenet_id': bnet,
                        'race': replay_data['player_races'].get(player_name, "Unknown"),
                        'total_score': 0,
                        'matches_played': 0
                    }
                self.results['players'][player_name]['total_score'] += score
                self.results['players'][player_name]['matches_played'] += 1

            match_entry = {
                'match_id': match['id'],
                'player1': {
                    'name': player1_name,
                    'battlenet_id': player1_bnet,
                    'score': score1,
                    'race': replay_data['player_races'].get(player1_name, "Unknown")
                },
                'player2': {
                    'name': player2_name,
                    'battlenet_id': player2_bnet,
                    'score': score2,
                    'race': replay_data['player_races'].get(player2_name, "Unknown")
                },
                'start_time': match_data.get('created_at', replay_data['match_start']),
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
    # Configuration
    API_KEY = "your_challonge_api_key_here"
    BNET_CONFIG = "battlenet_ids.json"
    REPLAY_FILE = "sc2_replay_data.json"
    OUTPUT_FILE = "tournament_results.json"

    # Initialize analyzer
    analyzer = TournamentAnalyzer(API_KEY, BNET_CONFIG)
    
    # Print tournament list and get user input
    analyzer.print_tournament_list()
    tournament_id = input("Enter the tournament ID you want to analyze: ").strip()
    
    # Analyze tournament
    try:
        results = analyzer.analyze_tournament(tournament_id, REPLAY_FILE)
        
        # Save results
        analyzer.save_results(OUTPUT_FILE)
        print(f"Results saved to {OUTPUT_FILE}")
        print(f"Tournament: {results['tournament_name']}")
        print(f"Total matches: {len(results['matches'])}")
        print(f"Total players: {len(results['players'])}")
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    main()