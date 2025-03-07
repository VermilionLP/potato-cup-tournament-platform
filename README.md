# StarCraft Ultra Chicken Cup Utilities

A Python program that integrates the Challonge API with Battle.net IDs and SC2 replay data. 

To use this program, you'll need to:

1. **Prepare Configuration Files:**
   - Create `battlenet_ids.json`:
     ```json
     {
       "Player1": "Player1#1234",
       "Player2": "Player2#5678"
     }
     ```
   - Prepare SC2 replay data file (`sc2_replay_data.json`) from your processing program:
     ```json
     {
       "player_races": {
         "Player1": "Terran",
         "Player2": "Zerg"
       },
       "timestamp": "2025-03-06T12:00:00Z"
     }
     ```

2. **Install Dependencies:**
   ```bash
   pip install requests
   ```

3. **Key Features:**
   - Fetches tournament info, matches, and participants from Challonge API
   - Integrates Battle.net IDs from config
   - Processes SC2 replay data (placeholder - you'll need to implement this)
   - Summarizes player stats and match details
   - Saves results to JSON

4. **Expected Output Format:**
   ```json
   {
     "tournament_name": "StarCraft II Tournament",
     "tournament_id": "sc2tourny123",
     "matches": [
       {
         "match_id": "8008135",
         "player1": {
           "name": "Player1",
           "battlenet_id": "Player1#1234",
           "score": 2,
           "race": "Terran"
         },
         "player2": {
           "name": "Player2",
           "battlenet_id": "Player2#5678",
           "score": 1,
           "race": "Zerg"
         },
         "start_time": "2025-03-06T12:00:00Z",
         "state": "complete",
         "winner_id": "355"
       }
     ],
     "players": {
       "Player1": {
         "battlenet_id": "Player1#1234",
         "race": "Terran",
         "total_score": 2,
         "matches_played": 1
       },
       "Player2": {
         "battlenet_id": "Player2#5678",
         "race": "Zerg",
         "total_score": 1,
         "matches_played": 1
       }
     }
   }
   ```

5. **Next Steps:**
   - Replace `"your_challonge_api_key_here"` with your actual v1 API key.
   - Ensure your `battlenet_ids.json` and `sc2_replay_data.json` files are ready.
   - Modify the results structure if you need additional fields

6. **Run the Script:**
   ```bash
   python script_name.py
   ```
7. **View Tournament List:**
   - The script will print all tournaments associated with your API key, e.g.:
     ```
     Available Tournaments:
     ID              Name
     --------------------------------------------------
     sc2tourny123    StarCraft II Tournament
     r6siege2025     Rainbow Six Siege 2025
     --------------------------------------------------
     ```
8. **Select Tournament:**
   - Copy a tournament ID (e.g., `sc2tourny123`) to your clipboard.
   - Paste it when prompted (just press Enter if it's already in the clipboard), or type it manually.
   - Example interaction:
     ```
     Paste the tournament ID from your clipboard (or type it manually) and press Enter:
     Detected from clipboard: sc2tourny123
     Tournament ID: [Enter]
     ```

9. **Output:**
   - The script will process the tournament and save the results as before.