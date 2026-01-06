import crypto from 'crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db.js';

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const JWT_SECRET = process.env.JWT_SECRET;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DEV_AUTH = process.env.DEV_AUTH === 'true';

function loadAssetCatalog() {
  try {
    const catalogPath = path.join(__dirname, 'public', 'assets', 'catalog.json');
    const content = fs.readFileSync(catalogPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.warn('Asset catalog not found, using empty catalog');
    return { base: [], hair: [], top: [], bottom: [], shoes: [] };
  }
}

const ASSET_CATALOG = loadAssetCatalog();
const ASSET_IDS = {
  hair: ASSET_CATALOG.hair?.map((item) => item.id) || [],
  top: ASSET_CATALOG.top?.map((item) => item.id) || [],
  bottom: ASSET_CATALOG.bottom?.map((item) => item.id) || [],
  shoes: ASSET_CATALOG.shoes?.map((item) => item.id) || [],
};

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required');
}

function jsonError(res, status, code, message, details) {
  res.status(status).json({ code, message, details });
}

function validateInitData(initData) {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is required');
  }
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) {
    return false;
  }
  params.delete('hash');
  const dataCheck = [];
  for (const [key, value] of params.entries()) {
    dataCheck.push(`${key}=${value}`);
  }
  dataCheck.sort();
  const dataCheckString = dataCheck.join('\n');
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(TELEGRAM_BOT_TOKEN)
    .digest();
  const computedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  const hashBuffer = Buffer.from(hash, 'hex');
  const computedBuffer = Buffer.from(computedHash, 'hex');
  if (hashBuffer.length !== computedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(hashBuffer, computedBuffer);
}

function getUserFromInitData(initData) {
  const params = new URLSearchParams(initData);
  const userJson = params.get('user');
  if (!userJson) {
    return null;
  }
  try {
    return JSON.parse(userJson);
  } catch {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const token = req.cookies.session;
  if (!token) {
    return jsonError(res, 401, 'unauthorized', 'Not authenticated');
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    return next();
  } catch {
    return jsonError(res, 401, 'unauthorized', 'Invalid session');
  }
}

app.post('/api/auth/telegram', async (req, res) => {
  const { initData } = req.body || {};
  if (!initData || typeof initData !== 'string') {
    return jsonError(res, 400, 'bad_request', 'initData is required');
  }
  if (DEV_AUTH && initData === 'dev') {
    try {
      const result = await pool.query(
        `INSERT INTO users (telegram_id, username, first_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (telegram_id)
         DO UPDATE SET username = EXCLUDED.username, first_name = EXCLUDED.first_name
         RETURNING *`,
        [999000111, 'dev_user', 'Dev']
      );
      const user = result.rows[0];
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '2h' });
      res.cookie('session', token, { httpOnly: true, sameSite: 'lax' });
      return res.json({ ok: true, user, dev: true });
    } catch (error) {
      return jsonError(res, 500, 'server_error', 'Failed to save user', error.message);
    }
  }
  let valid = false;
  try {
    valid = validateInitData(initData);
  } catch (error) {
    return jsonError(res, 500, 'config_error', error.message);
  }
  if (!valid) {
    return jsonError(res, 401, 'invalid_init_data', 'Invalid Telegram initData');
  }
  const userData = getUserFromInitData(initData);
  if (!userData || !userData.id) {
    return jsonError(res, 400, 'bad_request', 'Missing user data in initData');
  }

  try {
    const result = await pool.query(
      `INSERT INTO users (telegram_id, username, first_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (telegram_id)
       DO UPDATE SET username = EXCLUDED.username, first_name = EXCLUDED.first_name
       RETURNING *`,
      [userData.id, userData.username || null, userData.first_name || null]
    );
    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '2h' });
    res.cookie('session', token, { httpOnly: true, sameSite: 'lax' });
    return res.json({ ok: true, user });
  } catch (error) {
    return jsonError(res, 500, 'server_error', 'Failed to save user', error.message);
  }
});

app.post('/api/auth/dev', async (req, res) => {
  if (!DEV_AUTH) {
    return jsonError(res, 404, 'not_found', 'DEV_AUTH is disabled');
  }
  const { telegram_id, username, first_name } = req.body || {};
  const devTelegramId = Number(telegram_id || 999000111);
  if (Number.isNaN(devTelegramId)) {
    return jsonError(res, 400, 'validation_error', 'telegram_id must be numeric');
  }
  try {
    const result = await pool.query(
      `INSERT INTO users (telegram_id, username, first_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (telegram_id)
       DO UPDATE SET username = EXCLUDED.username, first_name = EXCLUDED.first_name
       RETURNING *`,
      [devTelegramId, username || 'dev_user', first_name || 'Dev']
    );
    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '2h' });
    res.cookie('session', token, { httpOnly: true, sameSite: 'lax' });
    return res.json({ ok: true, user, dev: true });
  } catch (error) {
    return jsonError(res, 500, 'server_error', 'Failed to save user', error.message);
  }
});

app.get('/api/character', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM characters WHERE user_id = $1',
      [req.userId]
    );
    return res.json({ character: result.rows[0] || null });
  } catch (error) {
    return jsonError(res, 500, 'server_error', 'Failed to load character', error.message);
  }
});

function validateCharacterPayload(body) {
  const required = ['name', 'age', 'height_cm', 'weight_kg', 'hair_style', 'hair_color', 'outfit_top', 'outfit_bottom', 'outfit_shoes'];
  for (const field of required) {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      return `Field ${field} is required`;
    }
  }
  const age = Number(body.age);
  const height = Number(body.height_cm);
  const weight = Number(body.weight_kg);
  if (Number.isNaN(age) || age < 1 || age > 120) {
    return 'Invalid age';
  }
  if (Number.isNaN(height) || height < 50 || height > 250) {
    return 'Invalid height';
  }
  if (Number.isNaN(weight) || weight < 20 || weight > 300) {
    return 'Invalid weight';
  }
  if (!ASSET_IDS.hair.includes(body.hair_style)) {
    return 'Invalid hair_style asset';
  }
  if (!ASSET_IDS.hair.includes(body.hair_color)) {
    return 'Invalid hair_color asset';
  }
  if (!ASSET_IDS.top.includes(body.outfit_top)) {
    return 'Invalid outfit_top asset';
  }
  if (!ASSET_IDS.bottom.includes(body.outfit_bottom)) {
    return 'Invalid outfit_bottom asset';
  }
  if (!ASSET_IDS.shoes.includes(body.outfit_shoes)) {
    return 'Invalid outfit_shoes asset';
  }
  return null;
}

app.post('/api/character', authMiddleware, async (req, res) => {
  const errorMessage = validateCharacterPayload(req.body || {});
  if (errorMessage) {
    return jsonError(res, 400, 'validation_error', errorMessage);
  }
  const payload = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO characters
        (user_id, name, age, height_cm, weight_kg, hair_style, hair_color, outfit_top, outfit_bottom, outfit_shoes)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (user_id)
       DO UPDATE SET
        name = EXCLUDED.name,
        age = EXCLUDED.age,
        height_cm = EXCLUDED.height_cm,
        weight_kg = EXCLUDED.weight_kg,
        hair_style = EXCLUDED.hair_style,
        hair_color = EXCLUDED.hair_color,
        outfit_top = EXCLUDED.outfit_top,
        outfit_bottom = EXCLUDED.outfit_bottom,
        outfit_shoes = EXCLUDED.outfit_shoes,
        updated_at = NOW()
       RETURNING *`,
      [
        req.userId,
        payload.name,
        payload.age,
        payload.height_cm,
        payload.weight_kg,
        payload.hair_style,
        payload.hair_color,
        payload.outfit_top,
        payload.outfit_bottom,
        payload.outfit_shoes,
      ]
    );
    return res.json({ character: result.rows[0] });
  } catch (error) {
    return jsonError(res, 500, 'server_error', 'Failed to save character', error.message);
  }
});

app.get('/api/quests', authMiddleware, async (req, res) => {
  const status = req.query.status || 'active';
  if (!['active', 'done'].includes(status)) {
    return jsonError(res, 400, 'validation_error', 'Invalid status');
  }
  try {
    const result = await pool.query(
      `SELECT q.*, COALESCE(
        (SELECT json_agg(qs ORDER BY qs.order_index)
         FROM quest_steps qs WHERE qs.quest_id = q.id), '[]'
       ) AS steps
       FROM quests q
       WHERE q.user_id = $1 AND q.status = $2
       ORDER BY q.created_at DESC`,
      [req.userId, status]
    );
    return res.json({ items: result.rows });
  } catch (error) {
    return jsonError(res, 500, 'server_error', 'Failed to load quests', error.message);
  }
});

function validateQuestPayload(body) {
  if (!body.title || body.title.trim().length === 0) {
    return 'title is required';
  }
  const xpReward = body.xp_reward ?? 10;
  const xpValue = Number(xpReward);
  if (Number.isNaN(xpValue) || xpValue < 1 || xpValue > 1000) {
    return 'xp_reward must be between 1 and 1000';
  }
  const repeatType = body.repeat_type || 'none';
  if (!['none', 'daily', 'weekly', 'monthly'].includes(repeatType)) {
    return 'Invalid repeat_type';
  }
  return null;
}

app.post('/api/quests', authMiddleware, async (req, res) => {
  const errorMessage = validateQuestPayload(req.body || {});
  if (errorMessage) {
    return jsonError(res, 400, 'validation_error', errorMessage);
  }
  const { title, description, xp_reward, due_at, repeat_type, repeat_interval, steps } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const questResult = await client.query(
      `INSERT INTO quests
        (user_id, character_id, title, description, xp_reward, status, due_at, repeat_type, repeat_interval)
       VALUES
        ($1, (SELECT id FROM characters WHERE user_id = $1), $2, $3, $4, 'active', $5, $6, $7)
       RETURNING *`,
      [
        req.userId,
        title,
        description || null,
        xp_reward ?? 10,
        due_at || null,
        repeat_type || 'none',
        repeat_interval ?? 1,
      ]
    );
    const quest = questResult.rows[0];

    if (Array.isArray(steps) && steps.length > 0) {
      let index = 0;
      for (const step of steps) {
        if (!step.title) {
          continue;
        }
        await client.query(
          `INSERT INTO quest_steps (quest_id, title, is_done, order_index)
           VALUES ($1, $2, false, $3)`,
          [quest.id, step.title, index]
        );
        index += 1;
      }
    }

    await client.query('COMMIT');
    return res.json({ quest });
  } catch (error) {
    await client.query('ROLLBACK');
    return jsonError(res, 500, 'server_error', 'Failed to create quest', error.message);
  } finally {
    client.release();
  }
});

app.patch('/api/quests/:id', authMiddleware, async (req, res) => {
  const questId = req.params.id;
  const fields = ['title', 'description', 'xp_reward', 'due_at', 'repeat_type', 'repeat_interval', 'status'];
  const updates = [];
  const values = [questId, req.userId];
  let idx = 3;
  for (const field of fields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = $${idx}`);
      values.push(req.body[field]);
      idx += 1;
    }
  }
  if (updates.length === 0) {
    return jsonError(res, 400, 'validation_error', 'No fields to update');
  }
  try {
    const result = await pool.query(
      `UPDATE quests SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      values
    );
    if (!result.rows[0]) {
      return jsonError(res, 404, 'not_found', 'Quest not found');
    }
    return res.json({ quest: result.rows[0] });
  } catch (error) {
    return jsonError(res, 500, 'server_error', 'Failed to update quest', error.message);
  }
});

app.delete('/api/quests/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM quests WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.userId]
    );
    if (!result.rows[0]) {
      return jsonError(res, 404, 'not_found', 'Quest not found');
    }
    return res.json({ ok: true });
  } catch (error) {
    return jsonError(res, 500, 'server_error', 'Failed to delete quest', error.message);
  }
});

function calculateLevel({ level, xp }, earnedXp) {
  let currentLevel = level;
  let currentXp = xp + earnedXp;
  while (true) {
    const xpToNext = 100 + (currentLevel - 1) * 50;
    if (currentXp >= xpToNext) {
      currentXp -= xpToNext;
      currentLevel += 1;
    } else {
      break;
    }
  }
  return { level: currentLevel, xp: currentXp };
}

function computeNextDueAt(dueAt, repeatType) {
  const base = dueAt ? new Date(dueAt) : new Date();
  const next = new Date(base.getTime());
  if (repeatType === 'daily') {
    next.setDate(next.getDate() + 1);
  } else if (repeatType === 'weekly') {
    next.setDate(next.getDate() + 7);
  } else if (repeatType === 'monthly') {
    next.setMonth(next.getMonth() + 1);
  }
  return next;
}

app.post('/api/quests/:id/complete', authMiddleware, async (req, res) => {
  const questId = req.params.id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const questResult = await client.query(
      'SELECT * FROM quests WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [questId, req.userId]
    );
    const quest = questResult.rows[0];
    if (!quest) {
      await client.query('ROLLBACK');
      return jsonError(res, 404, 'not_found', 'Quest not found');
    }
    if (quest.status === 'done') {
      await client.query('ROLLBACK');
      return jsonError(res, 400, 'validation_error', 'Quest already completed');
    }

    await client.query(
      `UPDATE quests SET status = 'done', completed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [questId]
    );

    const characterResult = await client.query(
      'SELECT * FROM characters WHERE id = $1 FOR UPDATE',
      [quest.character_id]
    );
    const character = characterResult.rows[0];
    if (!character) {
      await client.query('ROLLBACK');
      return jsonError(res, 400, 'validation_error', 'Character not found for quest');
    }
    const updated = calculateLevel(character, quest.xp_reward);
    const characterUpdate = await client.query(
      'UPDATE characters SET level = $1, xp = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
      [updated.level, updated.xp, character.id]
    );

    let nextQuest = null;
    if (quest.repeat_type && quest.repeat_type !== 'none') {
      const dueAt = computeNextDueAt(quest.due_at, quest.repeat_type);
      const nextQuestResult = await client.query(
        `INSERT INTO quests
          (user_id, character_id, title, description, xp_reward, status, due_at, repeat_type, repeat_interval)
         VALUES
          ($1, $2, $3, $4, $5, 'active', $6, $7, $8)
         RETURNING *`,
        [
          quest.user_id,
          quest.character_id,
          quest.title,
          quest.description,
          quest.xp_reward,
          dueAt,
          quest.repeat_type,
          quest.repeat_interval,
        ]
      );
      nextQuest = nextQuestResult.rows[0];

      const stepsResult = await client.query(
        'SELECT * FROM quest_steps WHERE quest_id = $1 ORDER BY order_index',
        [questId]
      );
      let index = 0;
      for (const step of stepsResult.rows) {
        await client.query(
          'INSERT INTO quest_steps (quest_id, title, is_done, order_index) VALUES ($1, $2, false, $3)',
          [nextQuest.id, step.title, index]
        );
        index += 1;
      }
    }

    await client.query('COMMIT');
    return res.json({
      quest: { ...quest, status: 'done', completed_at: new Date().toISOString() },
      character: characterUpdate.rows[0],
      nextQuest,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return jsonError(res, 500, 'server_error', 'Failed to complete quest', error.message);
  } finally {
    client.release();
  }
});

app.post('/api/quests/:id/steps', authMiddleware, async (req, res) => {
  const { title } = req.body || {};
  if (!title) {
    return jsonError(res, 400, 'validation_error', 'title is required');
  }
  try {
    const quest = await pool.query(
      'SELECT id FROM quests WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (!quest.rows[0]) {
      return jsonError(res, 404, 'not_found', 'Quest not found');
    }
    const orderResult = await pool.query(
      'SELECT COALESCE(MAX(order_index), -1) + 1 as next_index FROM quest_steps WHERE quest_id = $1',
      [req.params.id]
    );
    const orderIndex = orderResult.rows[0].next_index;
    const result = await pool.query(
      'INSERT INTO quest_steps (quest_id, title, is_done, order_index) VALUES ($1, $2, false, $3) RETURNING *',
      [req.params.id, title, orderIndex]
    );
    return res.json({ step: result.rows[0] });
  } catch (error) {
    return jsonError(res, 500, 'server_error', 'Failed to create step', error.message);
  }
});

app.patch('/api/steps/:id', authMiddleware, async (req, res) => {
  const fields = ['title', 'is_done'];
  const updates = [];
  const values = [req.params.id, req.userId];
  let idx = 3;
  for (const field of fields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = $${idx}`);
      values.push(req.body[field]);
      idx += 1;
    }
  }
  if (updates.length === 0) {
    return jsonError(res, 400, 'validation_error', 'No fields to update');
  }
  try {
    const result = await pool.query(
      `UPDATE quest_steps SET ${updates.join(', ')}
       WHERE id = $1 AND quest_id IN (SELECT id FROM quests WHERE user_id = $2)
       RETURNING *`,
      values
    );
    if (!result.rows[0]) {
      return jsonError(res, 404, 'not_found', 'Step not found');
    }
    return res.json({ step: result.rows[0] });
  } catch (error) {
    return jsonError(res, 500, 'server_error', 'Failed to update step', error.message);
  }
});

app.delete('/api/steps/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM quest_steps
       WHERE id = $1 AND quest_id IN (SELECT id FROM quests WHERE user_id = $2)
       RETURNING id`,
      [req.params.id, req.userId]
    );
    if (!result.rows[0]) {
      return jsonError(res, 404, 'not_found', 'Step not found');
    }
    return res.json({ ok: true });
  } catch (error) {
    return jsonError(res, 500, 'server_error', 'Failed to delete step', error.message);
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`gamelive app listening on port ${port}`);
});
