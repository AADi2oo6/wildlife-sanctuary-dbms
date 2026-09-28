import { Router } from 'express';
import prisma from '../config/prisma.js';

const router = Router();

// Public telemetry ingestion endpoint for IoT nodes & edge simulation
router.post('/', async (req, res) => {
  try {
    const {
      device_uid,
      node_id,
      threat_type,
      sound_level_db,
      confidence_score,
      battery_level,
      notes,
      latitude,
      longitude,
    } = req.body;

    // 1. Resolve Node Identifier
    let node = null;
    if (device_uid) {
      node = await prisma.iotNode.findFirst({
        where: { device_uid: String(device_uid).trim() },
      });
    }
    if (!node && node_id) {
      node = await prisma.iotNode.findUnique({
        where: { node_id: parseInt(node_id, 10) },
      });
    }
    if (!node) {
      // Default to the target deployed Collage Garden node
      node = await prisma.iotNode.findFirst({
        where: { device_uid: 'DGN-NODE-67SF-608' },
      });
    }
    if (!node) {
      // Fallback to first available IoT node
      node = await prisma.iotNode.findFirst();
    }

    if (!node) {
      return res.status(404).json({
        status: 'error',
        error: 'No IoT node registered to receive telemetry. Please register a node first.',
      });
    }

    // 2. Evaluate Telemetry Values
    let decibel = sound_level_db !== undefined && sound_level_db !== null ? parseFloat(sound_level_db) : null;
    let confidence = confidence_score !== undefined && confidence_score !== null ? parseFloat(confidence_score) : null;
    const threat = threat_type ? String(threat_type).trim() : null;

    if (decibel === null && threat) {
      const lower = threat.toLowerCase();
      if (lower === 'gunshot') decibel = 114.5;
      else if (lower === 'chainsaw') decibel = 88.0;
      else if (lower === 'vehicle') decibel = 76.5;
      else if (lower === 'fire') decibel = 65.0;
      else decibel = 70.0;
    }

    if (confidence === null && threat) {
      confidence = 0.92;
    }

    let is_anomaly = false;
    let severity = 'INFO';
    let trigger_event_id = null;

    // Check for acoustic threshold (>= 82 dB) or explicit threat
    if (threat || (decibel !== null && decibel >= 82.0)) {
      is_anomaly = true;
      const lower = threat ? threat.toLowerCase() : '';

      if (['chainsaw', 'gunshot', 'fire'].includes(lower) || (decibel !== null && decibel >= 85.0)) {
        severity = 'ALERT';
      } else if (['vehicle', 'pir motion', 'intrusion'].includes(lower) || (decibel !== null && decibel >= 70.0)) {
        severity = 'WARNING';
      }

      const triggerType = (threat ? threat.toUpperCase() : 'ACOUSTIC_DISTURBANCE').replace(/\s+/g, '_');
      const details = notes || `Threat detected by sensor: ${threat || 'Acoustic spike'}`;

      const createdEvent = await prisma.iotTriggerEvent.create({
        data: {
          node_id: node.node_id,
          trigger_type: triggerType,
          severity,
          decibel_level: decibel,
          confidence,
          details,
          audio_sample_url: req.body.audio_sample_url || null,
          image_snapshot_url: req.body.image_snapshot_url || null,
          audio_ai_analysis: req.body.audio_ai_analysis || null,
          vision_ai_analysis: req.body.vision_ai_analysis || null,
          vision_score: req.body.vision_score ? parseFloat(req.body.vision_score) : null,
          is_manual: Boolean(req.body.is_manual),
          triggered_at: new Date(),
        },
      });

      trigger_event_id = createdEvent.event_id;
    }

    // 3. Update Node Status & Last Ping
    const newStatus = severity === 'ALERT' ? 'ALERT' : node.status;
    const updateData = {
      last_ping: new Date(),
    };
    if (newStatus !== node.status) updateData.status = newStatus;
    if (battery_level !== undefined && battery_level !== null) {
      updateData.battery_level = Math.max(0, Math.min(100, parseInt(battery_level, 10)));
    }
    if (latitude !== undefined && latitude !== null) updateData.latitude = parseFloat(latitude);
    if (longitude !== undefined && longitude !== null) updateData.longitude = parseFloat(longitude);

    await prisma.iotNode.update({
      where: { node_id: node.node_id },
      data: updateData,
    });

    console.log(
      `📡 [Express Telemetry] Ingested for '${node.name}' (${node.device_uid}) | ` +
      `Threat: ${threat || 'None'} | dB: ${decibel} | Anomaly: ${is_anomaly} | Status: ${newStatus}`
    );

    return res.status(200).json({
      status: 'success',
      message: 'Telemetry processed successfully',
      node_id: node.node_id,
      device_uid: node.device_uid,
      node_name: node.name,
      node_status: newStatus,
      sound_level_db: decibel,
      threat_type: threat,
      severity,
      is_anomaly,
      trigger_event_id,
      confidence,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('🔥 Express Telemetry Ingestion Fault:', error);
    return res.status(500).json({ status: 'error', error: 'Internal telemetry ingestion error' });
  }
});

export default router;
