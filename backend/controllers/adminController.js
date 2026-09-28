import prisma from '../config/prisma.js';

/* ──────────────────────────────────────────
   VISITORS
────────────────────────────────────────── */

/** GET /api/admin/visitors — all visitors with booking count */
export const getAllVisitors = async (req, res) => {
  try {
    const visitors = await prisma.visitor.findMany({
      select: {
        visitor_id: true,
        first_name: true,
        last_name:  true,
        email:      true,
        age:        true,
        role:       true,
        created_at: true,
        _count: { select: { tickets: true } },
        // Include staff record so frontend can display operational role
        staff: { select: { role: true } },
      },
      orderBy: { visitor_id: 'asc' },
    });
    return res.status(200).json({ success: true, visitors });
  } catch (error) {
    console.error('🔥 Admin – Visitor Fetch Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch visitors.' });
  }
};

/** PUT /api/admin/visitors/:id/role — change a visitor's role.
 *  Triggers handle the rest: staff auto-create/delete, role cascade.
 */
export const updateVisitorRole = async (req, res) => {
  try {
    const visitor_id = parseInt(req.params.id, 10);
    const { role }   = req.body;

    const VALID_ROLES = ['VISITOR', 'STAFF', 'ADMIN'];
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ success: false, error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` });
    }

    // One update — DB triggers handle staff record creation/deletion
    const updated = await prisma.visitor.update({
      where:  { visitor_id },
      data:   { role },
      select: { visitor_id: true, first_name: true, last_name: true, email: true, role: true },
    });

    return res.status(200).json({ success: true, message: 'Visitor role updated.', visitor: updated });
  } catch (error) {
    console.error('🔥 Admin – Role Update Error:', error);
    if (error.code === 'P2025') return res.status(404).json({ success: false, error: 'Visitor not found.' });
    return res.status(500).json({ success: false, error: 'Failed to update role.' });
  }
};

/* ──────────────────────────────────────────
   STAFF
────────────────────────────────────────── */

/** GET /api/admin/staff — all staff members */
export const getAllStaff = async (req, res) => {
  try {
    const staff = await prisma.staff.findMany({
      include: {
        visitors: {
          select: { visitor_id: true, first_name: true, last_name: true, email: true, role: true, created_at: true },
        },
        _count: { select: { medical_cases: true } },
      },
      orderBy: { staff_id: 'asc' },
    });
    return res.status(200).json({ success: true, staff });
  } catch (error) {
    console.error('🔥 Admin – Staff Fetch Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch staff.' });
  }
};

/** POST /api/admin/staff — promote a visitor to staff.
 *  Body: { visitor_id, role, first_name, last_name, email }
 *  DB trigger (trg_staff_insert) auto-syncs visitor.role.
 */
export const createStaffMember = async (req, res) => {
  try {
    const { visitor_id, role, first_name, last_name, email } = req.body;

    if (!visitor_id || !role || !first_name || !last_name || !email) {
      return res.status(400).json({ success: false, error: 'All fields are required: visitor_id, role, first_name, last_name, email.' });
    }

    // Verify visitor exists
    const visitor = await prisma.visitor.findUnique({ where: { visitor_id: parseInt(visitor_id, 10) } });
    if (!visitor) return res.status(404).json({ success: false, error: 'Visitor not found.' });

    // Create staff record — trg_staff_insert fires and syncs visitor.role automatically
    const staff = await prisma.staff.create({
      data: {
        staff_id:   parseInt(visitor_id, 10),
        first_name,
        last_name,
        role,
        email,
      },
    });

    return res.status(201).json({ success: true, message: 'Staff member registered.', staff });
  } catch (error) {
    console.error('🔥 Admin – Staff Creation Error:', error);
    if (error.code === 'P2002') return res.status(409).json({ success: false, error: 'This visitor is already a staff member.' });
    return res.status(500).json({ success: false, error: 'Failed to create staff member.' });
  }
};

/* ──────────────────────────────────────────
   ANIMALS
────────────────────────────────────────── */

/** PUT /api/admin/animals/:id/status — update an animal's health status */
export const updateAnimalStatus = async (req, res) => {
  try {
    const animal_id = parseInt(req.params.id, 10);
    const { health_status } = req.body;

    const VALID = ['HEALTHY', 'UNDER_CARE', 'CRITICAL', 'QUARANTINED'];
    if (!VALID.includes(health_status)) {
      return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${VALID.join(', ')}` });
    }

    const animal = await prisma.animal.update({
      where: { animal_id },
      data:  { health_status },
      select: { animal_id: true, species: true, nickname: true, health_status: true },
    });

    return res.status(200).json({ success: true, message: 'Animal status updated.', animal });
  } catch (error) {
    console.error('🔥 Admin – Animal Status Update Error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, error: 'Animal not found.' });
    }
    return res.status(500).json({ success: false, error: 'Failed to update animal status.' });
  }
};

/** DELETE /api/admin/animals/:id — remove an animal */
export const deleteAnimal = async (req, res) => {
  try {
    const animal_id = parseInt(req.params.id, 10);
    await prisma.animal.delete({ where: { animal_id } });
    return res.status(200).json({ success: true, message: 'Animal removed from registry.' });
  } catch (error) {
    console.error('🔥 Admin – Animal Delete Error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, error: 'Animal not found.' });
    }
    return res.status(500).json({ success: false, error: 'Failed to delete animal.' });
  }
};

/* ──────────────────────────────────────────
   ZONES
────────────────────────────────────────── */

/** DELETE /api/admin/zones/:id — remove a zone (cascades to enclosures/animals/tickets) */
export const deleteZone = async (req, res) => {
  try {
    const zone_id = parseInt(req.params.id, 10);
    await prisma.zone.delete({ where: { zone_id } });
    return res.status(200).json({ success: true, message: 'Zone deleted.' });
  } catch (error) {
    console.error('🔥 Admin – Zone Delete Error:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ success: false, error: 'Zone not found.' });
    }
    return res.status(500).json({ success: false, error: 'Failed to delete zone.' });
  }
};

/* ──────────────────────────────────────────
   TICKETS (all visitors)
────────────────────────────────────────── */

/** GET /api/admin/tickets — all tickets across all visitors */
export const getAllTickets = async (req, res) => {
  try {
    const [tickets, totals] = await Promise.all([
      prisma.ticket.findMany({
        orderBy: { booking_date: 'desc' },
        include: {
          visitor: { select: { visitor_id: true, first_name: true, last_name: true, email: true } },
          zone:    { select: { zone_id: true, name: true, climate: true } },
        },
      }),
      prisma.ticket.aggregate({
        _count: { ticket_id: true },
        _sum:   { total_amount: true },
      }),
    ]);

    return res.status(200).json({
      success: true,
      tickets,
      summary: {
        total_tickets:  totals._count.ticket_id,
        total_revenue:  parseFloat(totals._sum.total_amount ?? 0),
      },
    });
  } catch (error) {
    console.error('🔥 Admin – All Tickets Fetch Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch tickets.' });
  }
};

/* ──────────────────────────────────────────
   OVERVIEW STATS
────────────────────────────────────────── */

/** GET /api/admin/stats — aggregate counts for the admin overview */
export const getAdminStats = async (req, res) => {
  try {
    const [visitorCount, staffCount, animalCount, ticketAgg, zoneCount] = await Promise.all([
      prisma.visitor.count(),
      prisma.staff.count(),
      prisma.animal.count(),
      prisma.ticket.aggregate({ _count: { ticket_id: true }, _sum: { total_amount: true } }),
      prisma.zone.count(),
    ]);

    return res.status(200).json({
      success: true,
      stats: {
        total_visitors: visitorCount,
        total_staff:    staffCount,
        total_animals:  animalCount,
        total_zones:    zoneCount,
        total_tickets:  ticketAgg._count.ticket_id,
        total_revenue:  parseFloat(ticketAgg._sum.total_amount ?? 0),
      },
    });
  } catch (error) {
    console.error('🔥 Admin – Stats Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch admin stats.' });
  }
};

/* ──────────────────────────────────────────
   ENCLOSURES
────────────────────────────────────────── */

/** GET /api/admin/enclosures — all enclosures with zone + animal count */
export const getAllEnclosures = async (req, res) => {
  try {
    const enclosures = await prisma.enclosure.findMany({
      include: {
        zone: { select: { zone_id: true, name: true, climate: true } },
        _count: { select: { animals: true } },
      },
      orderBy: { enclosure_id: 'asc' },
    });
    return res.status(200).json({ success: true, enclosures });
  } catch (error) {
    console.error('🔥 Admin – Enclosures Fetch Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch enclosures.' });
  }
};

/** DELETE /api/admin/enclosures/:id */
export const deleteEnclosure = async (req, res) => {
  try {
    const enclosure_id = parseInt(req.params.id, 10);
    await prisma.enclosure.delete({ where: { enclosure_id } });
    return res.status(200).json({ success: true, message: 'Enclosure deleted.' });
  } catch (error) {
    console.error('🔥 Admin – Enclosure Delete Error:', error);
    if (error.code === 'P2025') return res.status(404).json({ success: false, error: 'Enclosure not found.' });
    return res.status(500).json({ success: false, error: 'Failed to delete enclosure.' });
  }
};

/* ──────────────────────────────────────────
   HEALTH LOGS
────────────────────────────────────────── */

/** GET /api/admin/health-logs — all health logs across all animals */
export const getAllHealthLogs = async (req, res) => {
  try {
    const logs = await prisma.healthLog.findMany({
      orderBy: { logged_at: 'desc' },
      include: {
        animal:       { select: { animal_id: true, species: true, nickname: true, health_status: true } },
        veterinarian: { select: { staff_id: true, first_name: true, last_name: true, role: true } },
      },
    });
    return res.status(200).json({ success: true, logs });
  } catch (error) {
    console.error('🔥 Admin – Health Logs Fetch Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch health logs.' });
  }
};

/** DELETE /api/admin/health-logs/:id */
export const deleteHealthLog = async (req, res) => {
  try {
    const log_id = BigInt(req.params.id);
    await prisma.healthLog.delete({ where: { log_id } });
    return res.status(200).json({ success: true, message: 'Health log deleted.' });
  } catch (error) {
    console.error('🔥 Admin – Health Log Delete Error:', error);
    if (error.code === 'P2025') return res.status(404).json({ success: false, error: 'Log not found.' });
    return res.status(500).json({ success: false, error: 'Failed to delete health log.' });
  }
};

/* ──────────────────────────────────────────
   SURVEYS
────────────────────────────────────────── */

/** GET /api/admin/surveys — all field surveys with animal info */
export const getAllSurveys = async (req, res) => {
  try {
    const surveys = await prisma.survey.findMany({
      orderBy: { survey_date: 'desc' },
      include: {
        animal: { select: { animal_id: true, species: true, nickname: true } },
      },
    });
    // Normalise BigInt survey_id + Decimal coords
    const result = surveys.map(s => ({
      ...s,
      survey_id:      String(s.survey_id),
      latitude:       parseFloat(s.latitude),
      longitude:      parseFloat(s.longitude),
    }));
    return res.status(200).json({ success: true, surveys: result });
  } catch (error) {
    console.error('🔥 Admin – Surveys Fetch Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch surveys.' });
  }
};

/** DELETE /api/admin/surveys/:id */
export const deleteSurvey = async (req, res) => {
  try {
    const survey_id = BigInt(req.params.id);
    await prisma.survey.delete({ where: { survey_id } });
    return res.status(200).json({ success: true, message: 'Survey deleted.' });
  } catch (error) {
    console.error('🔥 Admin – Survey Delete Error:', error);
    if (error.code === 'P2025') return res.status(404).json({ success: false, error: 'Survey not found.' });
    return res.status(500).json({ success: false, error: 'Failed to delete survey.' });
  }
};

/* ──────────────────────────────────────────
   FEEDBACK
────────────────────────────────────────── */

/** GET /api/admin/feedback — all visitor feedback */
export const getAllFeedback = async (req, res) => {
  try {
    const feedback = await prisma.feedback.findMany({
      orderBy: { submitted_at: 'desc' },
      include: {
        visitor: { select: { visitor_id: true, first_name: true, last_name: true, email: true } },
      },
    });
    return res.status(200).json({ success: true, feedback });
  } catch (error) {
    console.error('🔥 Admin – Feedback Fetch Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch feedback.' });
  }
};

/** DELETE /api/admin/feedback/:id */
export const deleteFeedback = async (req, res) => {
  try {
    const feedback_id = parseInt(req.params.id, 10);
    await prisma.feedback.delete({ where: { feedback_id } });
    return res.status(200).json({ success: true, message: 'Feedback deleted.' });
  } catch (error) {
    console.error('🔥 Admin – Feedback Delete Error:', error);
    if (error.code === 'P2025') return res.status(404).json({ success: false, error: 'Feedback not found.' });
    return res.status(500).json({ success: false, error: 'Failed to delete feedback.' });
  }
};

/** POST /api/feedback — submit feedback (authenticated visitor) */
export const submitFeedback = async (req, res) => {
  try {
    const visitor_id = req.user.visitor_id;
    const { rating, comments } = req.body;

    if (!rating || !comments) {
      return res.status(400).json({ success: false, error: 'Rating and comments are required.' });
    }
    const r = parseInt(rating, 10);
    if (r < 1 || r > 5) {
      return res.status(400).json({ success: false, error: 'Rating must be between 1 and 5.' });
    }
    if (comments.trim().length < 10) {
      return res.status(400).json({ success: false, error: 'Comments must be at least 10 characters.' });
    }

    const feedback = await prisma.feedback.create({
      data: { visitor_id, rating: r, comments: comments.trim() },
    });
    return res.status(201).json({ success: true, message: 'Feedback submitted. Thank you!', feedback });
  } catch (error) {
    console.error('🔥 Feedback Submit Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to submit feedback.' });
  }
};

/** GET /api/feedback — public, returns all feedback (visitor last name truncated for privacy) */
export const getPublicFeedback = async (req, res) => {
  try {
    const feedback = await prisma.feedback.findMany({
      orderBy: [{ rating: 'desc' }, { submitted_at: 'desc' }],
      take: 50,
      include: {
        visitor: { select: { first_name: true, last_name: true } },
      },
    });

    // Mask last name to initial for privacy  e.g. "Aarav S."
    const safe = feedback.map(f => ({
      feedback_id:  f.feedback_id,
      rating:       f.rating,
      comments:     f.comments,
      submitted_at: f.submitted_at,
      author: f.visitor
        ? `${f.visitor.first_name} ${f.visitor.last_name.charAt(0)}.`
        : 'Anonymous',
    }));

    return res.status(200).json({ success: true, feedback: safe });
  } catch (error) {
    console.error('🔥 Public Feedback Fetch Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to load feedback.' });
  }
};




/* ──────────────────────────────────────────
   DELETE STAFF
────────────────────────────────────────── */

/**
 * DELETE /api/admin/staff/:id
 * Removes the staff record. DB trigger (trg_staff_delete) auto-reverts
 * the linked visitor.role back to 'VISITOR'.
 */
export const deleteStaff = async (req, res) => {
  try {
    const staff_id = parseInt(req.params.id, 10);

    // Single delete — trigger handles visitor.role revert automatically
    await prisma.staff.delete({ where: { staff_id } });

    return res.status(200).json({ success: true, message: 'Staff member removed. Visitor role reverted.' });
  } catch (error) {
    console.error('🔥 Admin – Staff Delete Error:', error);
    if (error.code === 'P2025') return res.status(404).json({ success: false, error: 'Staff member not found.' });
    return res.status(500).json({ success: false, error: 'Failed to remove staff member.' });
  }
};


/* ──────────────────────────────────────────
   CONTACT MESSAGES
────────────────────────────────────────── */

/** POST /api/contact — public, no auth required */
export const submitContactMessage = async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name?.trim() || !email?.trim() || !subject?.trim() || !message?.trim()) {
      return res.status(400).json({ success: false, error: 'All fields are required.' });
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      return res.status(400).json({ success: false, error: 'Enter a valid email address.' });
    }
    if (message.trim().length < 10) {
      return res.status(400).json({ success: false, error: 'Message must be at least 10 characters.' });
    }

    const contact = await prisma.contactMessage.create({
      data: { name: name.trim(), email: email.trim(), subject: subject.trim(), message: message.trim() },
    });
    return res.status(201).json({ success: true, message: 'Message received. We will get back to you within 24 hours!', contact });
  } catch (error) {
    console.error('🔥 Contact Submit Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to send message. Please try again.' });
  }
};

/** GET /api/admin/contact — admin: list all messages */
export const getAllContactMessages = async (req, res) => {
  try {
    const messages = await prisma.contactMessage.findMany({
      orderBy: { submitted_at: 'desc' },
    });
    return res.status(200).json({ success: true, messages });
  } catch (error) {
    console.error('🔥 Admin – Contact Messages Fetch Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch contact messages.' });
  }
};

/** PATCH /api/admin/contact/:id/read — mark as read */
export const markContactMessageRead = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await prisma.contactMessage.update({ where: { id }, data: { is_read: true } });
    return res.status(200).json({ success: true, message: 'Marked as read.' });
  } catch (error) {
    console.error('🔥 Admin – Contact Mark Read Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update message.' });
  }
};

/** DELETE /api/admin/contact/:id */
export const deleteContactMessage = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await prisma.contactMessage.delete({ where: { id } });
    return res.status(200).json({ success: true, message: 'Contact message deleted.' });
  } catch (error) {
    console.error('🔥 Admin – Contact Delete Error:', error);
    if (error.code === 'P2025') return res.status(404).json({ success: false, error: 'Message not found.' });
    return res.status(500).json({ success: false, error: 'Failed to delete message.' });
  }
};

/** GET /api/admin/iot-nodes — list all deployed IoT nodes */
export const getAllIotNodes = async (req, res) => {
  try {
    const nodes = await prisma.iotNode.findMany({
      include: {
        zone: { select: { zone_id: true, name: true } },
        custom_area: { select: { area_id: true, name: true, color: true } },
        _count: { select: { trigger_events: true } },
      },
      orderBy: { created_at: 'desc' },
    });
    return res.status(200).json({ success: true, nodes });
  } catch (error) {
    console.error('🔥 Admin – Fetch IoT Nodes Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch IoT nodes.' });
  }
};

/** POST /api/admin/iot-nodes — deploy a new IoT node */
export const createIotNode = async (req, res) => {
  try {
    const {
      name,
      device_uid,
      latitude,
      longitude,
      status,
      battery_level,
      sensor_type,
      notes,
      zone_id,
      custom_area_id,
      com_port,
      baud_rate,
      camera_url,
      camera_stream_url,
      is_listening,
    } = req.body;

    if (!name || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ success: false, error: 'Node name, latitude, and longitude are required.' });
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ success: false, error: 'Valid geographic coordinates are required.' });
    }

    const uid = device_uid && device_uid.trim()
      ? device_uid.trim()
      : `DGN-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const node = await prisma.iotNode.create({
      data: {
        name: name.trim(),
        device_uid: uid,
        latitude: lat,
        longitude: lng,
        status: status || 'ACTIVE',
        battery_level: battery_level !== undefined ? parseInt(battery_level, 10) : 100,
        sensor_type: sensor_type || 'ACOUSTIC_VISION',
        com_port: com_port ? com_port.trim() : null,
        baud_rate: baud_rate ? parseInt(baud_rate, 10) : 115200,
        camera_url: camera_url ? camera_url.trim() : null,
        camera_stream_url: camera_stream_url ? camera_stream_url.trim() : null,
        is_listening: Boolean(is_listening),
        notes: notes ? notes.trim() : null,
        zone_id: zone_id ? parseInt(zone_id, 10) : null,
        custom_area_id: custom_area_id ? parseInt(custom_area_id, 10) : null,
      },
      include: {
        zone: { select: { zone_id: true, name: true } },
        custom_area: { select: { area_id: true, name: true, color: true } },
      },
    });

    return res.status(201).json({ success: true, message: 'IoT node deployed successfully.', node });
  } catch (error) {
    console.error('🔥 Admin – Deploy IoT Node Error:', error);
    if (error.code === 'P2002') {
      return res.status(409).json({ success: false, error: 'An IoT node with this Device UID already exists.' });
    }
    return res.status(500).json({ success: false, error: 'Failed to deploy IoT node.' });
  }
};

/** PATCH /api/admin/iot-nodes/:id — update an IoT node */
export const updateIotNode = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const {
      name,
      status,
      battery_level,
      sensor_type,
      notes,
      zone_id,
      custom_area_id,
      com_port,
      baud_rate,
      camera_url,
      camera_stream_url,
      is_listening,
    } = req.body;

    const data = {};
    if (name !== undefined) data.name = name.trim();
    if (status !== undefined) data.status = status;
    if (battery_level !== undefined) data.battery_level = parseInt(battery_level, 10);
    if (sensor_type !== undefined) data.sensor_type = sensor_type;
    if (notes !== undefined) data.notes = notes ? notes.trim() : null;
    if (zone_id !== undefined) data.zone_id = zone_id ? parseInt(zone_id, 10) : null;
    if (custom_area_id !== undefined) data.custom_area_id = custom_area_id ? parseInt(custom_area_id, 10) : null;
    if (com_port !== undefined) data.com_port = com_port ? com_port.trim() : null;
    if (baud_rate !== undefined) data.baud_rate = baud_rate ? parseInt(baud_rate, 10) : 115200;
    if (camera_url !== undefined) data.camera_url = camera_url ? camera_url.trim() : null;
    if (camera_stream_url !== undefined) data.camera_stream_url = camera_stream_url ? camera_stream_url.trim() : null;
    if (is_listening !== undefined) data.is_listening = Boolean(is_listening);

    const updatedNode = await prisma.iotNode.update({
      where: { node_id: id },
      data,
      include: {
        zone: { select: { zone_id: true, name: true } },
        custom_area: { select: { area_id: true, name: true, color: true } },
      },
    });

    return res.status(200).json({ success: true, message: 'IoT node updated successfully.', node: updatedNode });
  } catch (error) {
    console.error('🔥 Admin – Update IoT Node Error:', error);
    if (error.code === 'P2025') return res.status(404).json({ success: false, error: 'IoT node not found.' });
    return res.status(500).json({ success: false, error: 'Failed to update IoT node.' });
  }
};

/** DELETE /api/admin/iot-nodes/:id — decommission / delete an IoT node */
export const deleteIotNode = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await prisma.iotNode.delete({ where: { node_id: id } });
    return res.status(200).json({ success: true, message: 'IoT node decommissioned successfully.' });
  } catch (error) {
    console.error('🔥 Admin – Delete IoT Node Error:', error);
    if (error.code === 'P2025') return res.status(404).json({ success: false, error: 'IoT node not found.' });
    return res.status(500).json({ success: false, error: 'Failed to delete IoT node.' });
  }
};

/** GET /api/admin/custom-areas — list all custom marked areas */
export const getAllCustomAreas = async (req, res) => {
  try {
    const areas = await prisma.customArea.findMany({
      include: {
        iot_nodes: {
          select: { node_id: true, name: true, status: true, battery_level: true, latitude: true, longitude: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });
    return res.status(200).json({ success: true, areas });
  } catch (error) {
    console.error('🔥 Admin – Fetch Custom Areas Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch custom areas.' });
  }
};

/** POST /api/admin/custom-areas — save a new custom marked area */
export const createCustomArea = async (req, res) => {
  try {
    const { name, area_type, coordinates, area_sq_km, color, climate, description } = req.body;

    if (!name || !coordinates || !Array.isArray(coordinates) || coordinates.length < 3) {
      return res.status(400).json({ success: false, error: 'Area name and at least 3 perimeter coordinates are required.' });
    }

    const area = await prisma.customArea.create({
      data: {
        name: name.trim(),
        area_type: area_type || 'FOREST',
        coordinates,
        area_sq_km: parseFloat(area_sq_km) || 0,
        color: color || '#22c55e',
        climate: climate ? climate.trim() : null,
        description: description ? description.trim() : null,
      },
      include: {
        iot_nodes: true,
      },
    });

    return res.status(201).json({ success: true, message: 'Custom area saved successfully.', area });
  } catch (error) {
    console.error('🔥 Admin – Create Custom Area Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to save custom area.' });
  }
};

/** DELETE /api/admin/custom-areas/:id — delete a custom area */
export const deleteCustomArea = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await prisma.customArea.delete({ where: { area_id: id } });
    return res.status(200).json({ success: true, message: 'Custom area removed successfully.' });
  } catch (error) {
    console.error('🔥 Admin – Delete Custom Area Error:', error);
    if (error.code === 'P2025') return res.status(404).json({ success: false, error: 'Custom area not found.' });
    return res.status(500).json({ success: false, error: 'Failed to delete custom area.' });
  }
};

/** GET /api/admin/iot-nodes/:id/triggers — retrieve memory/trigger history for a specific node */
export const getNodeTriggers = async (req, res) => {
  try {
    const nodeId = parseInt(req.params.id, 10);
    const { timeframe } = req.query; // '24h', '7d', '30d', 'all'

    const node = await prisma.iotNode.findUnique({
      where: { node_id: nodeId },
      include: {
        zone: { select: { zone_id: true, name: true } },
        custom_area: { select: { area_id: true, name: true, color: true } },
      },
    });

    if (!node) {
      return res.status(404).json({ success: false, error: 'IoT node not found.' });
    }

    let dateFilter = undefined;
    const now = new Date();
    if (timeframe === '24h') {
      dateFilter = { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) };
    } else if (timeframe === '7d') {
      dateFilter = { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
    } else if (timeframe === '30d') {
      dateFilter = { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
    }

    const whereClause = {
      node_id: nodeId,
      ...(dateFilter ? { triggered_at: dateFilter } : {}),
    };

    const triggers = await prisma.iotTriggerEvent.findMany({
      where: whereClause,
      orderBy: { triggered_at: 'asc' }, // chronological for time-series graph
    });

    // Compute summary stats
    const total = triggers.length;
    const alertCount = triggers.filter((t) => t.severity === 'ALERT').length;
    const warningCount = triggers.filter((t) => t.severity === 'WARNING').length;
    const infoCount = triggers.filter((t) => t.severity === 'INFO').length;

    let maxDecibel = 0;
    let sumConfidence = 0;
    let confidenceCount = 0;

    triggers.forEach((t) => {
      const db = t.decibel_level ? parseFloat(t.decibel_level) : 0;
      if (db > maxDecibel) maxDecibel = db;
      if (t.confidence) {
        sumConfidence += parseFloat(t.confidence);
        confidenceCount++;
      }
    });

    const avgConfidence = confidenceCount > 0 ? parseFloat((sumConfidence / confidenceCount).toFixed(3)) : null;
    const lastTrigger = triggers.length > 0 ? triggers[triggers.length - 1].triggered_at : null;

    return res.status(200).json({
      success: true,
      node,
      triggers,
      stats: {
        total,
        alertCount,
        warningCount,
        infoCount,
        maxDecibel,
        avgConfidence,
        lastTrigger,
      },
    });
  } catch (error) {
    console.error('🔥 Admin – Fetch Node Triggers Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch node trigger history.' });
  }
};

/** POST /api/admin/iot-nodes/:id/triggers — log / simulate a new trigger event in node memory */
export const createNodeTrigger = async (req, res) => {
  try {
    const nodeId = parseInt(req.params.id, 10);
    const {
      trigger_type,
      severity,
      decibel_level,
      confidence,
      details,
      audio_sample_url,
      image_snapshot_url,
      audio_ai_analysis,
      vision_ai_analysis,
      vision_score,
      is_manual,
      triggered_at,
    } = req.body;

    const node = await prisma.iotNode.findUnique({ where: { node_id: nodeId } });
    if (!node) {
      return res.status(404).json({ success: false, error: 'IoT node not found.' });
    }

    const eventTime = triggered_at ? new Date(triggered_at) : new Date();

    const trigger = await prisma.iotTriggerEvent.create({
      data: {
        node_id: nodeId,
        trigger_type: trigger_type || 'ACOUSTIC_DISTURBANCE',
        severity: severity || 'ALERT',
        decibel_level: decibel_level ? parseFloat(decibel_level) : null,
        confidence: confidence ? parseFloat(confidence) : 0.90,
        details: details ? details.trim() : null,
        audio_sample_url: audio_sample_url || null,
        image_snapshot_url: image_snapshot_url || null,
        audio_ai_analysis: audio_ai_analysis || null,
        vision_ai_analysis: vision_ai_analysis || null,
        vision_score: vision_score ? parseFloat(vision_score) : null,
        is_manual: Boolean(is_manual),
        triggered_at: eventTime,
      },
    });

    // If it's an ALERT, also update the node's status to ALERT
    const updateData = { last_ping: eventTime };
    if (severity === 'ALERT') {
      updateData.status = 'ALERT';
    }

    await prisma.iotNode.update({
      where: { node_id: nodeId },
      data: updateData,
    });

    return res.status(201).json({
      success: true,
      message: 'Trigger logged to node memory.',
      trigger,
    });
  } catch (error) {
    console.error('🔥 Admin – Create Node Trigger Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to record trigger event.' });
  }
};



