const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_EMAIL = 'chamikadahanayaka25@gmail.com';

// PostgreSQL Database Connection (Supabase)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.connect((err, client, release) => {
  if (err) {
    return console.error('Error acquiring client', err.stack);
  }
  console.log('Connected to Supabase PostgreSQL database.');
  release();
  initDatabase();
});

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Multer Memory Storage for Base64 Uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only images (JPEG/PNG) and PDF files are allowed!'));
  }
});

function initDatabase() {
  pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'student',
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS student_profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      district TEXT,
      nearest_city TEXT,
      al_year TEXT
    );

    CREATE TABLE IF NOT EXISTS modules (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      category TEXT,
      al_year TEXT,
      thumbnail TEXT,
      youtube_url TEXT,
      is_published INTEGER DEFAULT 1,
      is_featured INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS module_access (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      module_id INTEGER REFERENCES modules(id) ON DELETE CASCADE,
      granted_by TEXT,
      granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, module_id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      module_ids TEXT NOT NULL,
      total_amount REAL NOT NULL,
      slip_path TEXT NOT NULL,
      status TEXT DEFAULT 'Pending',
      admin_notes TEXT,
      reviewed_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contact_messages (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT,
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `, (err, res) => {
    if (err) {
      console.error('Error creating tables:', err);
    } else {
      console.log('Database tables verified/created successfully.');
      setTimeout(seedDefaults, 1000);
    }
  });
}

async function seedDefaults() {
  try {
    const defaultSettings = [
      ['site_title', 'ONLINE ECON'],
      ['hero_title', 'ආර්ථික විද්‍යාව සරලව, පැහැදිලිව සහ විශ්වාසයෙන් ඉගෙන ගනිමු!'],
      ['hero_subtitle', 'උසස් පෙළ ආර්ථික විද්‍යාව සඳහා ඔබට අවශ්‍ය දැනුම, පාඩම් සහ අධ්‍යයන සම්පත් එකම තැනකින්.'],
      ['about_text', 'Online Econ යනු ශ්‍රී ලංකාවේ උසස් පෙළ ආර්ථික විද්‍යා සිසුන් වෙනුවෙන්ම නිර්මාණය කරන ලද ප්‍රමුඛ පෙළේ අධ්‍යාපනික වේදිකාවකි.'],
      ['contact_email', 'chamikadahanayaka25@gmail.com'],
      ['contact_phone', '+94 70 168 6072'],
      ['bank_details', 'Bank: People\'s Bank\nAccount Name: C.D. Perera\nAccount Number: 123-2-001-4-0000000\nBranch: Gampaha']
    ];

    for (const [key, val] of defaultSettings) {
      await pool.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
        [key, val]
      );
    }

    const userCheck = await pool.query(`SELECT * FROM users WHERE email = $1`, [ADMIN_EMAIL]);
    if (userCheck.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('Admin@2026', 10);
      const newUser = await pool.query(
        `INSERT INTO users (username, email, password, role, status) VALUES ($1, $2, $3, 'admin', 'active') RETURNING id`,
        ['chamika', ADMIN_EMAIL, hashedPassword]
      );
      const adminId = newUser.rows[0].id;
      await pool.query(
        `INSERT INTO student_profiles (user_id, full_name, district, al_year) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id) DO NOTHING`,
        [adminId, 'Chamika Dahanayake', 'ගම්පහ', '2026 A/L']
      );
      console.log('Default Admin Account created successfully in Supabase.');
    }
  } catch (e) {
    console.error('Error seeding defaults:', e);
  }
}

function requireAuth(req, res, next) {
  const userId = req.cookies.user_id;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized. Please sign in.' });
  }
  pool.query(`SELECT * FROM users WHERE id = $1 AND status = 'active'`, [userId], (err, result) => {
    if (err || result.rows.length === 0) {
      return res.status(401).json({ error: 'Session invalid or account suspended.' });
    }
    req.user = result.rows[0];
    next();
  });
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
    }
    next();
  });
}

// Direct Registration
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password, fullName, district, nearestCity, alYear } = req.body;
  if (!username || !email || !password || !fullName || !district) {
    return res.status(400).json({ error: 'සියලුම අත්‍යවශ්‍ය විස්තර පුරවන්න.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const role = (email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) ? 'admin' : 'student';

    const userResult = await pool.query(
      `INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id`,
      [username, email, hashedPassword, role]
    );
    const userId = userResult.rows[0].id;

    await pool.query(
      `INSERT INTO student_profiles (user_id, full_name, district, nearest_city, al_year) VALUES ($1, $2, $3, $4, $5)`,
      [userId, fullName, district, nearestCity || '', alYear || '2026 A/L']
    );

    res.json({ success: true, message: 'ගිණුම සාර්ථකව සාදන ලදී! දැන් ඔබට පිවිසිය හැක.' });
  } catch (e) {
    res.status(400).json({ error: 'ይህ Username එකක් හෝ ඊමේල් ලිපිනයක් දැනටමත් භාවිතයේ ඇත.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { usernameOrEmail, password } = req.body;
  if (!usernameOrEmail || !password) return res.status(400).json({ error: 'Username/Email සහ Password අවශ්‍ය වේ.' });

  try {
    const result = await pool.query(
      `SELECT * FROM users WHERE email = $1 OR username = $1`,
      [usernameOrEmail]
    );
    if (result.rows.length === 0) return res.status(401).json({ error: 'වැරදි Username/Email හෝ Password එකකි.' });
    
    const user = result.rows[0];
    if (user.status !== 'active') return res.status(403).json({ error: 'ගිණුම අත්හිටුවා ඇත.' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'වැරදි Username/Email හෝ Password එකකි.' });

    res.cookie('user_id', user.id, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ success: true, role: user.role, email: user.email, username: user.username });
  } catch (e) {
    res.status(500).json({ error: 'Server error during login.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('user_id');
  res.json({ success: true, message: 'Logged out successfully.' });
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const profileRes = await pool.query(
      `SELECT u.id, u.username, u.email, u.role, p.* FROM users u LEFT JOIN student_profiles p ON u.id = p.user_id WHERE u.id = $1`,
      [req.user.id]
    );
    if (profileRes.rows.length === 0) return res.status(404).json({ error: 'Profile not found.' });
    
    const profile = profileRes.rows[0];
    const accessRes = await pool.query(`SELECT module_id FROM module_access WHERE user_id = $1`, [req.user.id]);
    profile.authorized_modules = accessRes.rows.map(a => a.module_id);
    
    res.json(profile);
  } catch (e) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/settings', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM settings`);
    const settings = {};
    result.rows.forEach(r => settings[r.key] = r.value);
    res.json(settings);
  } catch (e) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/modules', async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM modules WHERE is_published = 1 ORDER BY id DESC`);
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/contact', async (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'Fill all required fields.' });

  try {
    await pool.query(
      `INSERT INTO contact_messages (name, email, subject, message) VALUES ($1, $2, $3, $4)`,
      [name, email, subject || 'General Inquiry', message]
    );
    res.json({ success: true, message: 'Message sent successfully!' });
  } catch (e) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/payments/submit', requireAuth, upload.single('bank_slip'), async (req, res) => {
  const { module_ids } = req.body;
  if (!req.file) return res.status(400).json({ error: 'බෑන්ක් ස්ලිප්පත අවශ්‍ය වේ.' });
  if (!module_ids) return res.status(400).json({ error: 'පාඩම් මාලාවක් තෝරන්න.' });

  let modIdsArray = [];
  try {
    modIdsArray = JSON.parse(module_ids);
  } catch (e) {
    modIdsArray = module_ids.split(',').map(Number);
  }

  try {
    const placeholders = modIdsArray.map((_, i) => `$${i + 1}`).join(',');
    const totalRes = await pool.query(`SELECT SUM(price) as total FROM modules WHERE id IN (${placeholders})`, modIdsArray);
    const totalAmount = totalRes.rows[0].total || 0;
    
    const b64 = Buffer.from(req.file.buffer).toString('base64');
    const slipPath = `data:${req.file.mimetype};base64,${b64}`;

    await pool.query(
      `INSERT INTO payments (user_id, module_ids, total_amount, slip_path, status) VALUES ($1, $2, $3, $4, 'Pending')`,
      [req.user.id, JSON.stringify(modIdsArray), totalAmount, slipPath]
    );

    res.json({ success: true, message: 'ගෙවීම් තොරතුරු සාර්ථකව ඉදිරිපත් කර ඇත!' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to submit payment application.' });
  }
});

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const stats = await pool.query(`SELECT 
      (SELECT COUNT(*) FROM users WHERE role = 'student') as total_students,
      (SELECT COUNT(*) FROM users WHERE status = 'active') as active_students,
      (SELECT COUNT(*) FROM modules) as total_modules,
      (SELECT COUNT(*) FROM payments) as total_payments,
      (SELECT COUNT(*) FROM payments WHERE status = 'Pending') as pending_payments,
      (SELECT COUNT(*) FROM payments WHERE status = 'Approved') as approved_payments,
      (SELECT COUNT(*) FROM payments WHERE status = 'Rejected') as rejected_payments
    `);
    res.json(stats.rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/admin/students', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`SELECT u.id, u.username, u.email, u.status, u.created_at, p.* FROM users u LEFT JOIN student_profiles p ON u.id = p.user_id WHERE u.role = 'student'`);
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/admin/payments', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`SELECT p.*, u.email, u.username, sp.full_name, sp.district FROM payments p JOIN users u ON p.user_id = u.id LEFT JOIN student_profiles sp ON u.id = sp.user_id ORDER BY p.id DESC`);
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/admin/payments/:id/review', requireAdmin, async (actionReq, actionRes) => {
  const paymentId = actionReq.params.id;
  const { status, admin_notes } = actionReq.body;

  if (!['Approved', 'Rejected'].includes(status)) {
    return actionRes.status(400).json({ error: 'Invalid status.' });
  }

  try {
    const payRes = await pool.query(`SELECT * FROM payments WHERE id = $1`, [paymentId]);
    if (payRes.rows.length === 0) return actionRes.status(404).json({ error: 'Payment application not found.' });
    const payment = payRes.rows[0];

    await pool.query(
      `UPDATE payments SET status = $1, admin_notes = $2, reviewed_by = $3 WHERE id = $4`,
      [status, admin_notes || '', actionReq.user.email, paymentId]
    );

    if (status === 'Approved') {
      try {
        const modIds = JSON.parse(payment.module_ids);
        for (const modId of modIds) {
          await pool.query(
            `INSERT INTO module_access (user_id, module_id, granted_by) VALUES ($1, $2, $3) ON CONFLICT (user_id, module_id) DO NOTHING`,
            [payment.user_id, modId, actionReq.user.email]
          );
        }
      } catch (e) {
        console.error('Error granting module access:', e);
      }
    }
    actionRes.json({ success: true, message: `Payment ${status} successfully!` });
  } catch (e) {
    actionRes.status(500).json({ error: 'Database update error.' });
  }
});

app.post('/api/admin/modules', requireAdmin, upload.single('thumbnail'), async (req, res) => {
  const { title, description, price, category, al_year, youtube_url, is_published, is_featured } = req.body;
  let thumbnailPath = '';
  
  if (req.file) {
    const b64 = Buffer.from(req.file.buffer).toString('base64');
    thumbnailPath = `data:${req.file.mimetype};base64,${b64}`;
  }

  try {
    await pool.query(
      `INSERT INTO modules (title, description, price, category, al_year, thumbnail, youtube_url, is_published, is_featured) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [title, description, price, category || 'Economics', al_year || '2026 A/L', thumbnailPath, youtube_url, is_published ? 1 : 1, is_featured ? 1 : 0]
    );
    res.json({ success: true, message: 'Module created successfully.' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to create module.' });
  }
});

app.delete('/api/admin/modules/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query(`DELETE FROM modules WHERE id = $1`, [req.params.id]);
    res.json({ success: true, message: 'Module deleted.' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete module.' });
  }
});

app.listen(PORT, () => {
  console.log(`ONLINE ECON LMS Server is running on port ${PORT}`);
});