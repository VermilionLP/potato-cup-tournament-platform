import proLeague from './ProLeague-Lineup.json';
import legacyJet from './Lagecy-Jet-Lineup.json';
import prop from './Prop-Lineup.json';
import propAb from './Prop-AB-Lineup.json';

export const defaultVehiclePools = [
  { id: "proleague", name: "ProLeague-Lineup", vehicles: proLeague },
  { id: "legacy-jet", name: "Lagecy-Jet-Lineup", vehicles: legacyJet },
  { id: "prop", name: "Prop-Lineup", vehicles: prop },
  { id: "prop-ab", name: "Prop-AB-Lineup", vehicles: propAb }
];
