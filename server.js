const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_EMAIL = 'chamikadahanayaka25@gmail.com';

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Multer Memory Storage (ഫයිල් ලෝකල් ෆෝල්ඩරවල Save කිරීම වෙනුවට මතකයේ තබාගෙන Base64 ලෙස ඩේටාබේස් එකට යැවීමට)
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

// Database Initialization
const dbFile = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbFile, (err) => {
  if (err) {
    console.error('Database connection error:', err.message);
  } else {
    console.log('Connected to SQLite database.');
    initDatabase();
  }
});

function initDatabase() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'student',
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS student_profiles (
      user_id INTEGER PRIMARY KEY,
      full_name TEXT NOT NULL,
      district TEXT,
      nearest_city TEXT,
      al_year TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      category TEXT,
      al_year TEXT,
      thumbnail TEXT,
      youtube_url TEXT,
      is_published INTEGER DEFAULT 1,
      is_featured INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS module_access (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      module_id INTEGER,
      granted_by TEXT,
      granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(module_id) REFERENCES modules(id) ON DELETE CASCADE,
      UNIQUE(user_id, module_id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      module_ids TEXT NOT NULL,
      total_amount REAL NOT NULL,
      slip_path TEXT NOT NULL,
      status TEXT DEFAULT 'Pending',
      admin_notes TEXT,
      reviewed_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    setTimeout(async () => {
      const defaultSettings = [
        ['site_title', 'ONLINE ECON'],
        ['hero_title', 'ආර්ථික විද්‍යාව සරලව, පැහැදිලිව සහ විශ්වාසයෙන් ඉගෙන ගනිමු!'],
        ['hero_subtitle', 'උසස් පෙළ ආර්ථික විද්‍යාව සඳහා ඔබට අවශ්‍ය දැනුම, පාඩම් සහ අධ්‍යයන සම්පත් එකම තැනකින්.'],
        ['about_text', 'Online Econ යනු ශ්‍රී ලංකාවේ උසස් පෙළ ආර්ථික විද්‍යා සිසුන් වෙනුවෙන්ම නිර්මාණය කරන ලද ප්‍රමුඛ පෙළේ අධ්‍යාපනික වේදිකාවකි.'],
        ['contact_email', 'chamikadahanayaka25@gmail.com'],
        ['contact_phone', '+94 70 168 6072'],
        ['bank_details', 'Bank: People\'s Bank\nAccount Name: C.D. Perera\nAccount Number: 123-2-001-4-0000000\nBranch: Gampaha']
      ];

      defaultSettings.forEach(([key, val]) => {
        db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, [key, val]);
      });

      db.get(`SELECT * FROM users WHERE email = ?`, [ADMIN_EMAIL], async (err, row) => {
        if (!row) {
          const hashedPassword = await bcrypt.hash('Admin@2026', 10);
          db.run(`INSERT INTO users (username, email, password, role, status) VALUES (?, ?, ?, 'admin', 'active')`, 
            ['chamika', ADMIN_EMAIL, hashedPassword], 
            function(err) {
              if (!err) {
                const adminId = this.lastID;
                db.run(`INSERT OR IGNORE INTO student_profiles (user_id, full_name, district, al_year) VALUES (?, ?, ?, ?)`,
                  [adminId, 'Chamika Dahanayake', 'ගම්පහ', '2026 A/L']);
                console.log('Default Admin Account created successfully');
              }
            }
          );
        }
      });
    }, 1000);
  });
}

function requireAuth(req, res, next) {
  const userId = req.cookies.user_id;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized. Please sign in.' });
  }
  db.get(`SELECT * FROM users WHERE id = ? AND status = 'active'`, [userId], (err, user) => {
    if (err || !user) {
      return res.status(401).json({ error: 'Session invalid or account suspended.' });
    }
    req.user = user;
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

    db.run(`INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)`, 
      [username, email, hashedPassword, role], function(err) {
      if (err) {
        return res.status(400).json({ error: 'ይህ Username එකක් හෝ ඊමේල් ලිපිනයක් දැනටමත් භාවිතයේ ඇත.' });
      }
      const userId = this.lastID;

      db.run(`INSERT INTO student_profiles (user_id, full_name, district, nearest_city, al_year) VALUES (?, ?, ?, ?, ?)`,
        [userId, fullName, district, nearestCity || '', alYear || '2026 A/L'], (err) => {
          res.json({ success: true, message: 'ගිණුම සාර්ථකව සාදන ලදී! දැන් ඔබට පිවිසිය හැක.' });
        }
      );
    });
  } catch (e) {
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { usernameOrEmail, password } = req.body;
  if (!usernameOrEmail || !password) return res.status(400).json({ error: 'Username/Email සහ Password අවශ්‍ය වේ.' });

  db.get(`SELECT * FROM users WHERE email = ? OR username = ?`, [usernameOrEmail, usernameOrEmail], async (err, user) => {
    if (err || !user) return res.status(401).json({ error: 'වැරදි Username/Email හෝ Password එකකි.' });
    if (user.status !== 'active') return res.status(403).json({ error: 'ගිණුම අත්හිටුවා ඇත.' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'වැරදි Username/Email හෝ Password එකකි.' });

    res.cookie('user_id', user.id, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ success: true, role: user.role, email: user.email, username: user.username });
  });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('user_id');
  res.json({ success: true, message: 'Logged out successfully.' });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  db.get(`SELECT u.id, u.username, u.email, u.role, p.* FROM users u LEFT JOIN student_profiles p ON u.id = p.user_id WHERE u.id = ?`, 
    [req.user.id], (err, profile) => {
      if (err || !profile) return res.status(404).json({ error: 'Profile not found.' });
      db.all(`SELECT module_id FROM module_access WHERE user_id = ?`, [req.user.id], (err, accesses) => {
        profile.authorized_modules = accesses ? accesses.map(a => a.module_id) : [];
        res.json(profile);
      });
    }
  );
});

app.get('/api/settings', (req, res) => {
  db.all(`SELECT * FROM settings`, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    const settings = {};
    rows.forEach(r => settings[r.key] = r.value);
    res.json(settings);
  });
});

app.get('/api/modules', (req, res) => {
  db.all(`SELECT * FROM modules WHERE is_published = 1 ORDER BY id DESC`, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

app.post('/api/contact', (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'Fill all required fields.' });

  db.run(`INSERT INTO contact_messages (name, email, subject, message) VALUES (?, ?, ?, ?)`,
    [name, email, subject || 'General Inquiry', message], (err) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json({ success: true, message: 'Message sent successfully!' });
    }
  );
});

// Base64 Payment Slip Submission
app.post('/api/payments/submit', requireAuth, upload.single('bank_slip'), (req, res) => {
  const { module_ids } = req.body;
  if (!req.file) return res.status(400).json({ error: 'බෑන්ක් ස්ලිප්පත අවශ්‍ය වේ.' });
  if (!module_ids) return res.status(400).json({ error: 'පාඩම් මාලාවක් තෝරන්න.' });

  let modIdsArray = [];
  try {
    modIdsArray = JSON.parse(module_ids);
  } catch (e) {
    modIdsArray = module_ids.split(',').map(Number);
  }

  const placeholders = modIdsArray.map(() => '?').join(',');
  db.all(`SELECT SUM(price) as total FROM modules WHERE id IN (${placeholders})`, modIdsArray, (err, rows) => {
    if (err || !rows[0]) return res.status(500).json({ error: 'Error calculating total.' });
    const totalAmount = rows[0].total || 0;
    
    // Convert file buffer to Base64 data URL
    const b64 = Buffer.from(req.file.buffer).toString('base64');
    const slipPath = `data:${req.file.mimetype};base64,${b64}`;

    db.run(`INSERT INTO payments (user_id, module_ids, total_amount, slip_path, status) VALUES (?, ?, ?, ?, 'Pending')`,
      [req.user.id, JSON.stringify(modIdsArray), totalAmount, slipPath], (err) => {
        if (err) return res.status(500).json({ error: 'Failed to submit payment application.' });
        res.json({ success: true, message: 'ගෙවීම් තොරතුරු සාර්ථකව ඉදිරිපත් කර ඇත!' });
      }
    );
  });
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  db.get(`SELECT 
    (SELECT COUNT(*) FROM users WHERE role = 'student') as total_students,
    (SELECT COUNT(*) FROM users WHERE status = 'active') as active_students,
    (SELECT COUNT(*) FROM modules) as total_modules,
    (SELECT COUNT(*) FROM payments) as total_payments,
    (SELECT COUNT(*) FROM payments WHERE status = 'Pending') as pending_payments,
    (SELECT COUNT(*) FROM payments WHERE status = 'Approved') as approved_payments,
    (SELECT COUNT(*) FROM payments WHERE status = 'Rejected') as rejected_payments
  `, (err, stats) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(stats);
  });
});

app.get('/api/admin/students', requireAdmin, (req, res) => {
  db.all(`SELECT u.id, u.username, u.email, u.status, u.created_at, p.* FROM users u LEFT JOIN student_profiles p ON u.id = p.user_id WHERE u.role = 'student'`, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

app.get('/api/admin/payments', requireAdmin, (req, res) => {
  db.all(`SELECT p.*, u.email, u.username, sp.full_name, sp.district FROM payments p JOIN users u ON p.user_id = u.id LEFT JOIN student_profiles sp ON u.id = sp.user_id ORDER BY p.id DESC`, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

app.post('/api/admin/payments/:id/review', requireAdmin, (actionReq, actionRes) => {
  const paymentId = actionReq.params.id;
  const { status, admin_notes } = actionReq.body;

  if (!['Approved', 'Rejected'].includes(status)) {
    return actionRes.status(400).json({ error: 'Invalid status.' });
  }

  db.get(`SELECT * FROM payments WHERE id = ?`, [paymentId], (err, payment) => {
    if (err || !payment) return actionRes.status(404).json({ error: 'Payment application not found.' });

    db.run(`UPDATE payments SET status = ?, admin_notes = ?, reviewed_by = ? WHERE id = ?`,
      [status, admin_notes || '', actionReq.user.email, paymentId], (err) => {
        if (err) return actionRes.status(500).json({ error: 'Database update error.' });

        if (status === 'Approved') {
          try {
            const modIds = JSON.parse(payment.module_ids);
            modIds.forEach(modId => {
              db.run(`INSERT OR IGNORE INTO module_access (user_id, module_id, granted_by) VALUES (?, ?, ?)`,
                [payment.user_id, modId, actionReq.user.email]);
            });
          } catch (e) {
            console.error('Error granting module access:', e);
          }
        }
        actionRes.json({ success: true, message: `Payment ${status} successfully!` });
      }
    );
  });
});

// Base64 Thumbnail Upload for Modules
app.post('/api/admin/modules', requireAdmin, upload.single('thumbnail'), (req, res) => {
  const { title, description, price, category, al_year, youtube_url, is_published, is_featured } = req.body;
  let thumbnailPath = '';
  
  if (req.file) {
    const b64 = Buffer.from(req.file.buffer).toString('base64');
    thumbnailPath = `data:${req.file.mimetype};base64,${b64}`;
  }

  db.run(`INSERT INTO modules (title, description, price, category, al_year, thumbnail, youtube_url, is_published, is_featured) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [title, description, price, category || 'Economics', al_year || '2026 A/L', thumbnailPath, youtube_url, is_published ? 1 : 1, is_featured ? 1 : 0], (err) => {
      if (err) return res.status(500).json({ error: 'Failed to create module.' });
      res.json({ success: true, message: 'Module created successfully.' });
    }
  );
});

app.delete('/api/admin/modules/:id', requireAdmin, (req, res) => {
  db.run(`DELETE FROM modules WHERE id = ?`, [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: 'Failed to delete module.' });
    res.json({ success: true, message: 'Module deleted.' });
  });
});

app.listen(PORT, () => {
  console.log(`ONLINE ECON LMS Server is running on port ${PORT}`);
});