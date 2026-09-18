'use strict';

// QoS / retain per OPP2 topic (level2.md). Keyed by "<publisher>/<message_type>".
const POLICY = {
  'apparatus/connection': { qos: 1, retain: true  },
  'software/connection':  { qos: 1, retain: true  },
  'apparatus/lights':     { qos: 1, retain: true  },
  'apparatus/clock':      { qos: 0, retain: true  },
  'apparatus/score':      { qos: 1, retain: true  },
  'apparatus/state':      { qos: 1, retain: true  },
  'apparatus/fencers':    { qos: 1, retain: true  },
  'apparatus/uw2f':       { qos: 1, retain: true  },
  'software/score':       { qos: 1, retain: false },
  'software/fencers':     { qos: 1, retain: false },
  'software/match':       { qos: 1, retain: false },
  'software/record':      { qos: 1, retain: true  },
  'apparatus/control':    { qos: 1, retain: false },
  'software/control':     { qos: 1, retain: false },
};

const topicFor = (pisteId, key) => `openpiste/${pisteId}/${key}`;

module.exports = { POLICY, topicFor };
