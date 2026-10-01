'use strict';

// QoS / retain per OPP2 topic, from esp32scoringdeviceMqtt/docs/level2.md
// (§4.4, §4.5, §6). apparatus/fencers and apparatus/match are retained, as the
// reference device publishes them (Opp2Handler.cpp boot recovery).
const POLICY = {
  'apparatus/connection': { qos: 1, retain: true  },
  'apparatus/lights':     { qos: 1, retain: true  },
  'apparatus/clock':      { qos: 0, retain: true  },
  'apparatus/score':      { qos: 1, retain: true  },
  'apparatus/state':      { qos: 1, retain: true  },
  'apparatus/fencers':    { qos: 1, retain: true  },
  'apparatus/match':      { qos: 1, retain: true  },
  'apparatus/uw2f':       { qos: 1, retain: true  },
  'apparatus/control':    { qos: 1, retain: false },
  'software/connection':  { qos: 1, retain: true  },
  'software/fencers':     { qos: 1, retain: false },
  'software/match':       { qos: 1, retain: false },
  'software/score':       { qos: 1, retain: false },
  'software/clock':       { qos: 0, retain: false },
  'software/control':     { qos: 1, retain: false },
  'software/record':      { qos: 1, retain: true  },
};

// Every topic starts with this root: "openpiste" on a venue broker, or
// "openpiste/{NOC}/{yyyy}/{mm}/{dd}/{tournament}" when publishing straight to
// the cloud broker (config "tournament", level2.md §31.2). Set once at start-up.
let root = 'openpiste';
const setTournament = t => { root = t ? `openpiste/${t}` : 'openpiste'; };
const topicRoot = () => root;

const topicFor = (pisteId, key) => `${root}/${pisteId}/${key}`;

module.exports = { POLICY, topicFor, topicRoot, setTournament };
