import prisma from '../config/prisma.js';

async function seedNodeMemory() {
  console.log('🌱 Seeding IoT Node Memory (Trigger History)...');
  
  const nodes = await prisma.iotNode.findMany();
  if (nodes.length === 0) {
    console.log('⚠️ No IoT nodes found to seed memory for.');
    process.exit(0);
  }

  const sampleTriggers = [
    {
      trigger_type: 'ACOUSTIC_DISTURBANCE',
      severity: 'ALERT',
      decibel_base: 86.5,
      confidence_base: 0.94,
      details: 'High-frequency acoustic signature matching 2-stroke chainsaw motor in continuous cutting pattern.',
    },
    {
      trigger_type: 'PIR_MOTION',
      severity: 'WARNING',
      decibel_base: 54.0,
      confidence_base: 0.88,
      details: 'Quad-element passive infrared sensor triggered along unmapped dense boundary trail.',
    },
    {
      trigger_type: 'ANIMAL_PROXIMITY',
      severity: 'INFO',
      decibel_base: 68.2,
      confidence_base: 0.93,
      details: 'Infrasonic low-frequency vocalization identified: Elephas maximus (Asian Elephant) herd matriarch.',
    },
    {
      trigger_type: 'GUNSHOT_ACOUSTIC',
      severity: 'ALERT',
      decibel_base: 112.0,
      confidence_base: 0.97,
      details: 'Sharp supersonic N-wave impulse acoustic profile matching centerfire rifle discharge.',
    },
    {
      trigger_type: 'VEHICLE_VIBRATION',
      severity: 'WARNING',
      decibel_base: 74.8,
      confidence_base: 0.85,
      details: 'Geophone seismic transducer detected irregular 4x4 off-road vehicle rumbling in core zone.',
    },
    {
      trigger_type: 'WILDFIRE_THERMAL',
      severity: 'ALERT',
      decibel_base: 62.0,
      confidence_base: 0.91,
      details: 'Infrared radiometric sensor spike (+14°C over baseline) and volatile organic compound detection.',
    },
    {
      trigger_type: 'SYSTEM_HEARTBEAT',
      severity: 'INFO',
      decibel_base: 28.5,
      confidence_base: 0.99,
      details: 'Diagnostic memory integrity check passed. Solar charge controller reporting 98% efficiency.',
    },
  ];

  const now = new Date();

  for (const node of nodes) {
    const existingCount = await prisma.iotTriggerEvent.count({ where: { node_id: node.node_id } });
    if (existingCount >= 5) {
      console.log(`✓ Node #${node.node_id} (${node.name}) already has ${existingCount} memory events.`);
      continue;
    }

    console.log(`⚙️ Seeding memory history for Node #${node.node_id} (${node.name})...`);

    // Generate 8-14 distributed trigger timestamps over the past 48 hours
    const numEvents = 8 + Math.floor(Math.random() * 7);
    const eventsToCreate = [];

    for (let i = 0; i < numEvents; i++) {
      // Distribute hours back between 0.5 hours to 48 hours
      const hoursAgo = (48 / numEvents) * (numEvents - i) - (Math.random() * 1.5);
      const triggeredAt = new Date(now.getTime() - Math.max(0.2, hoursAgo) * 60 * 60 * 1000);

      // Pick sample trigger type
      const sample = sampleTriggers[Math.floor(Math.random() * sampleTriggers.length)];
      const decibel = parseFloat((sample.decibel_base + (Math.random() * 8 - 4)).toFixed(1));
      const confidence = parseFloat(Math.min(0.99, sample.confidence_base + (Math.random() * 0.05 - 0.02)).toFixed(3));

      eventsToCreate.push({
        node_id: node.node_id,
        trigger_type: sample.trigger_type,
        severity: sample.severity,
        decibel_level: decibel,
        confidence: confidence,
        details: sample.details,
        triggered_at: triggeredAt,
      });
    }

    // Sort chronologically
    eventsToCreate.sort((a, b) => a.triggered_at.getTime() - b.triggered_at.getTime());

    for (const evt of eventsToCreate) {
      await prisma.iotTriggerEvent.create({ data: evt });
    }

    console.log(`  Added ${eventsToCreate.length} trigger events to Node #${node.node_id}.`);
  }

  console.log('✅ Finished seeding node memory history.');
  process.exit(0);
}

seedNodeMemory().catch((err) => {
  console.error('❌ Error seeding node memory:', err);
  process.exit(1);
});
