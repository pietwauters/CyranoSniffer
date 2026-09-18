'use strict';

const { POLICY, topicFor } = require('./topics');

// Publishes OPP2 messages, only when the body changed since last time.
// Adds protocol/version/ts, and a per-process seq on QoS 1 topics.
class Publisher {
  constructor(mqttClient, log = () => {}) {
    this.mqtt = mqttClient;
    this.log  = log;
    this.seq  = 0;
    this.last = new Map(); // topic -> JSON string of last body
  }

  publish(pisteId, key, body, { force = false } = {}) {
    const policy = POLICY[key];
    if (!policy) throw new Error(`Unknown OPP2 topic key: ${key}`);
    const topic = topicFor(pisteId, key);
    const sig = JSON.stringify(body);
    if (!force && this.last.get(topic) === sig) return false;
    this.last.set(topic, sig);

    const msg = { protocol: 'OPP2', version: '1.0' };
    if (policy.qos === 1) msg.seq = ++this.seq;
    msg.ts = Date.now();
    Object.assign(msg, body);

    this.mqtt.publish(topic, JSON.stringify(msg), policy);
    this.log(`[opp2] ${topic}`);
    return true;
  }
}

module.exports = { Publisher };
