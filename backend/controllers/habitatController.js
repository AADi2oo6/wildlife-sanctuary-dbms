import prisma from '../config/prisma.js';
import pkg from '@prisma/client';
const { Prisma } = pkg;

export const createEnclosure = async (req, res) => {
  try {
    const { zone_id, code_name, max_capacity } = req.body;

    const newEnclosure = await prisma.enclosure.create({
      data: {
        zone_id,
        code_name,
        max_capacity
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Physical habitat enclosure deployed to registry.',
      enclosure: newEnclosure
    });
  } catch (error) {
    console.error('🔥 Enclosure Deployment Blocked:', error);
    if (error.code === 'P2002') {
      return res.status(409).json({ success: false, error: 'Database Collision: An enclosure code name must be unique.' });
    }
    return res.status(500).json({ success: false, error: 'Internal server error constructing enclosure data rows.' });
  }
};

export const registerAnimal = async (req, res) => {
  try {
    const { enclosure_id, species, scientific_name, nickname, birth_date, health_status } = req.body;

    const newAnimal = await prisma.animal.create({
      data: {
        enclosure_id,
        species,
        scientific_name,
        nickname,
        birth_date: birth_date ? new Date(birth_date) : null,
        health_status: health_status || 'HEALTHY'
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Fauna specimen safely processed and placed into target enclosure.',
      animal: newAnimal
    });
  } catch (error) {
    console.error('🔥 Specimen Placement Aborted:', error.message);

    if (error.message.includes('PostgreSQL Integrity Block')) {
      return res.status(400).json({
        success: false,
        error: `Capacity Boundary Breach: ${error.message.split('ERROR:')[1]?.trim() || error.message}`
      });
    }

    return res.status(500).json({ success: false, error: 'Critical server error writing animal record to disk.' });
  }
};

/* ── GET all animals — powered by vw_animal_health_overview ── */
export const getAllAnimals = async (req, res) => {
  try {
    const { status, zone_id, search } = req.query;

    const conditions = [Prisma.sql`1=1`];

    if (status) {
      conditions.push(Prisma.sql`health_status = ${status}::"AnimalStatus"`);
    }
    if (zone_id) {
      conditions.push(Prisma.sql`zone_id = ${parseInt(zone_id, 10)}`);
    }
    if (search) {
      const q = `%${search.toLowerCase()}%`;
      conditions.push(Prisma.sql`(
        LOWER(species)         LIKE ${q} OR
        LOWER(nickname)        LIKE ${q} OR
        LOWER(scientific_name) LIKE ${q}
      )`);
    }

    const whereClause = Prisma.join(conditions, ' AND ');

    const rows = await prisma.$queryRaw`
      SELECT
        animal_id, species, scientific_name, nickname,
        health_status, birth_date, date_joined,
        enclosure_id, enclosure_name,
        zone_id, zone_name, climate,
        health_log_count, survey_count, last_health_check
      FROM vw_animal_health_overview
      WHERE ${whereClause}
      ORDER BY animal_id ASC
    `;

    // Normalise BigInt counts + reshape to match frontend AnimalCard shape
    const animals = rows.map(a => ({
      ...a,
      health_log_count: Number(a.health_log_count),
      survey_count:     Number(a.survey_count),
      enclosure: a.enclosure_id ? {
        enclosure_id: a.enclosure_id,
        code_name:    a.enclosure_name,
        zone: a.zone_id ? {
          zone_id: a.zone_id,
          name:    a.zone_name,
          climate: a.climate,
        } : null,
      } : null,
      _count: {
        surveys:     Number(a.survey_count),
        health_logs: Number(a.health_log_count),
      },
    }));

    return res.status(200).json({ success: true, animals });
  } catch (error) {
    console.error('🔥 Animal Fetch Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to retrieve animals.' });
  }
};

/* ── GET single animal — stats from vw_animal_health_overview,
       timeline from Prisma ── */
export const getAnimalById = async (req, res) => {
  try {
    const animal_id = parseInt(req.params.id, 10);
    if (isNaN(animal_id)) {
      return res.status(400).json({ success: false, error: 'Invalid animal ID.' });
    }

    // 1. Summary stats row from the view
    const [summary] = await prisma.$queryRaw`
      SELECT
        animal_id, species, scientific_name, nickname,
        health_status, birth_date, date_joined,
        enclosure_id, enclosure_name,
        zone_id, zone_name, climate,
        health_log_count, survey_count, last_health_check
      FROM vw_animal_health_overview
      WHERE animal_id = ${animal_id}
    `;

    if (!summary) {
      return res.status(404).json({ success: false, error: 'Animal not found.' });
    }

    // 2. Health-log timeline (10 most recent)
    const health_logs = await prisma.healthLog.findMany({
      where:   { animal_id },
      orderBy: { logged_at: 'desc' },
      take:    10,
      include: {
        veterinarian: {
          select: { first_name: true, last_name: true, role: true }
        }
      }
    });

    // 3. Recent surveys (5 most recent)
    const surveys = await prisma.survey.findMany({
      where:   { animal_id },
      orderBy: { survey_date: 'desc' },
      take:    5,
      select: {
        survey_id:      true,
        survey_date:    true,
        sighting_count: true,
        latitude:       true,
        longitude:      true,
      }
    });

    return res.status(200).json({
      success: true,
      animal: {
        animal_id:         summary.animal_id,
        species:           summary.species,
        scientific_name:   summary.scientific_name,
        nickname:          summary.nickname,
        health_status:     summary.health_status,
        birth_date:        summary.birth_date,
        date_joined:       summary.date_joined,
        last_health_check: summary.last_health_check,
        enclosure: summary.enclosure_id ? {
          enclosure_id: summary.enclosure_id,
          code_name:    summary.enclosure_name,
          zone: summary.zone_id ? {
            zone_id: summary.zone_id,
            name:    summary.zone_name,
            climate: summary.climate,
          } : null,
        } : null,
        health_logs,
        surveys,
        _count: {
          health_logs: Number(summary.health_log_count),
          surveys:     Number(summary.survey_count),
        },
      }
    });
  } catch (error) {
    console.error('🔥 Animal Detail Fetch Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to retrieve animal details.' });
  }
};