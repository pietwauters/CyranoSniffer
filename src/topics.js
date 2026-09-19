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
};

const topicFor = (pisteId, key) => `openpiste/${pisteId}/${key}`;

module.exports = { POLICY, topicFor };
