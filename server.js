'use strict';

const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const multer = require('multer');

const store = require('./src/db');
const { SECTIONS, UI, QUESTION_LABELS_AR } = require('./src/i18n');

const app = express();
const PORT = process.env.PORT || 8090;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use('/static', express.static(path.join(__dirname, 'public')));
app.set('trust proxy', 1);

const LOGO_PATH = path.join(store.DATA_DIR, 'logo.img');
const LOGO_MIMES = ['image/png', 'image/jpeg', 'image/webp'];
const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

app.use((req, res, next) => {
  res.locals.hasLogo = fs.existsSync(LOGO_PATH);
  next();
});

app.get('/logo', (req, res) => {
  if (!fs.existsSync(LOGO_PATH)) return res.status(404).end();
  res.type(store.getSetting('logo_mime', 'image/png'));
  res.sendFile(LOGO_PATH);
});

app.use(
  session({
    secret: store.getSetting('session_secret'),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 },
  })
);

function pickLang(req) {
  return req.query.lang === 'en' ? 'en' : 'ar';
}

function hotelName(lang) {
  return store.getSetting(lang === 'en' ? 'hotel_name_en' : 'hotel_name_ar');
}

function baseUrl(req) {
  const configured = store.getSetting('base_url', '');
  if (configured) return configured.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

// ---------------------------------------------------------------- guest survey

app.get('/', (req, res) => res.redirect('/admin'));

app.get('/s/:token', (req, res) => {
  const lang = pickLang(req);
  const t = UI[lang];
  const room = store.getRoomByToken(req.params.token);
  if (!room) {
    return res.status(404).render('message', {
      lang, t, hotel: hotelName(lang), title: t.invalidTitle, text: t.invalidText, token: null,
    });
  }
  if (store.isRoomLocked(room)) {
    return res.render('message', {
      lang, t, hotel: hotelName(lang), title: t.closedTitle, text: t.closedText, token: room.token,
    });
  }
  res.render('survey', {
    lang, t, sections: SECTIONS, room, hotel: hotelName(lang), error: null,
  });
});

app.post('/s/:token', (req, res) => {
  const lang = pickLang(req);
  const t = UI[lang];
  const room = store.getRoomByToken(req.params.token);
  if (!room) {
    return res.status(404).render('message', {
      lang, t, hotel: hotelName(lang), title: t.invalidTitle, text: t.invalidText, token: null,
    });
  }
  if (store.isRoomLocked(room)) {
    return res.render('message', {
      lang, t, hotel: hotelName(lang), title: t.closedTitle, text: t.closedText, token: room.token,
    });
  }

  const ratings = {};
  for (const key of store.RATING_KEYS) {
    const v = parseInt(req.body[key], 10);
    if (!Number.isInteger(v) || v < 1 || v > 5) {
      return res.status(400).render('survey', {
        lang, t, sections: SECTIONS, room, hotel: hotelName(lang), error: t.missingAnswers,
      });
    }
    ratings[key] = v;
  }
  const recommend = ['yes', 'maybe', 'no'].includes(req.body.recommend) ? req.body.recommend : null;
  if (!recommend) {
    return res.status(400).render('survey', {
      lang, t, sections: SECTIONS, room, hotel: hotelName(lang), error: t.missingAnswers,
    });
  }

  const comments = String(req.body.comments || '').slice(0, 2000).trim();
  const contact = String(req.body.contact || '').slice(0, 200).trim();

  store.insertResponse(room.id, lang, ratings, recommend, comments, contact, room.guest_name);
  store.lockRoom(room.id, parseInt(store.getSetting('lock_hours', '24'), 10) || 24);

  res.render('message', {
    lang, t, hotel: hotelName(lang), title: t.thanksTitle, text: t.thanksText, token: null,
  });
});

// ---------------------------------------------------------------------- admin

function requireAdmin(req, res, next) {
  if (req.session.isAdmin) return next();
  res.redirect('/admin/login');
}

app.get('/admin/login', (req, res) => {
  if (req.session.isAdmin) return res.redirect('/admin');
  res.render('admin/login', { error: null });
});

app.post('/admin/login', (req, res) => {
  const ok = bcrypt.compareSync(String(req.body.password || ''), store.getSetting('admin_password_hash'));
  if (!ok) return res.status(401).render('admin/login', { error: 'كلمة المرور غير صحيحة' });
  req.session.isAdmin = true;
  res.redirect('/admin');
});

app.post('/admin/logout', requireAdmin, (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

app.get('/admin', requireAdmin, (req, res) => {
  res.render('admin/dashboard', {
    page: 'dashboard',
    hotel: store.getSetting('hotel_name_ar'),
    stats: store.stats(),
    labels: QUESTION_LABELS_AR,
    ratingKeys: store.RATING_KEYS,
  });
});

function parseResponseFilters(req) {
  const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
  return {
    roomId: parseInt(req.query.room, 10) || null,
    from: isDate(req.query.from) ? req.query.from : null,
    to: isDate(req.query.to) ? req.query.to : null,
    q: String(req.query.q || '').trim().slice(0, 100) || null,
    sort: String(req.query.sort || 'newest'),
  };
}

app.get('/admin/responses', requireAdmin, (req, res) => {
  const filters = parseResponseFilters(req);
  res.render('admin/responses', {
    page: 'responses',
    hotel: store.getSetting('hotel_name_ar'),
    responses: store.listResponses(filters),
    rooms: store.listRooms(),
    filters,
    query: req.query,
    labels: QUESTION_LABELS_AR,
    ratingKeys: store.RATING_KEYS,
  });
});

app.get('/admin/rooms', requireAdmin, (req, res) => {
  res.render('admin/rooms', {
    page: 'rooms',
    hotel: store.getSetting('hotel_name_ar'),
    rooms: store.listRooms(),
    base: baseUrl(req),
    message: req.query.msg || null,
  });
});

app.post('/admin/rooms/add', requireAdmin, (req, res) => {
  const single = String(req.body.room_number || '').trim();
  const from = parseInt(req.body.from, 10);
  const to = parseInt(req.body.to, 10);
  let added = 0;
  if (single) {
    store.addRoom(single);
    added = 1;
  } else if (Number.isInteger(from) && Number.isInteger(to) && from <= to && to - from < 1000) {
    for (let n = from; n <= to; n++) {
      store.addRoom(n);
      added++;
    }
  }
  res.redirect(`/admin/rooms?msg=${encodeURIComponent(`تمت إضافة ${added} غرفة`)}`);
});

app.post('/admin/rooms/:id/reopen', requireAdmin, (req, res) => {
  store.reopenRoom(parseInt(req.params.id, 10));
  res.redirect('/admin/rooms?msg=' + encodeURIComponent('تم فتح الاستبيان للغرفة'));
});

app.post('/admin/rooms/:id/guest', requireAdmin, (req, res) => {
  const name = String(req.body.guest_name || '').trim().slice(0, 100);
  store.setRoomGuest(parseInt(req.params.id, 10), name);
  res.redirect('/admin/rooms?msg=' + encodeURIComponent(name ? 'تم حفظ اسم النزيل' : 'تم مسح اسم النزيل'));
});

app.post('/admin/rooms/:id/delete', requireAdmin, (req, res) => {
  store.deleteRoom(parseInt(req.params.id, 10));
  res.redirect('/admin/rooms?msg=' + encodeURIComponent('تم حذف الغرفة وإجاباتها'));
});

app.get('/admin/qr', requireAdmin, async (req, res) => {
  const base = baseUrl(req);
  const rooms = store.listRooms();
  const cards = [];
  for (const room of rooms) {
    const url = `${base}/s/${room.token}`;
    const dataUrl = await QRCode.toDataURL(url, { width: 300, margin: 1 });
    cards.push({ room, url, dataUrl });
  }
  res.render('admin/qr', {
    page: 'qr',
    hotel: store.getSetting('hotel_name_ar'),
    hotelEn: store.getSetting('hotel_name_en'),
    cards,
  });
});

app.get('/admin/export.csv', requireAdmin, (req, res) => {
  const rows = store.listResponses(parseResponseFilters(req), 100000);
  const header = [
    'رقم الغرفة', 'اسم النزيل', 'التاريخ', 'اللغة',
    ...store.RATING_KEYS.map((k) => QUESTION_LABELS_AR[k]),
    'التوصية', 'الملاحظات', 'التواصل',
  ];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [header.map(esc).join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.room_number, r.guest_name, r.submitted_at, r.language,
        ...store.RATING_KEYS.map((k) => r[k]),
        { yes: 'نعم', maybe: 'ربما', no: 'لا' }[r.recommend],
        r.comments, r.contact,
      ].map(esc).join(',')
    );
  }
  // BOM so Excel opens Arabic text correctly
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="survey-results.csv"');
  res.send('﻿' + lines.join('\r\n'));
});

app.get('/admin/settings', requireAdmin, (req, res) => {
  res.render('admin/settings', {
    page: 'settings',
    hotel: store.getSetting('hotel_name_ar'),
    values: {
      hotel_name_ar: store.getSetting('hotel_name_ar'),
      hotel_name_en: store.getSetting('hotel_name_en'),
      lock_hours: store.getSetting('lock_hours'),
      base_url: store.getSetting('base_url', ''),
    },
    message: req.query.msg || null,
  });
});

app.post('/admin/settings', requireAdmin, uploadLogo.single('logo'), (req, res) => {
  if (req.file) {
    if (!LOGO_MIMES.includes(req.file.mimetype)) {
      return res.redirect('/admin/settings?msg=' + encodeURIComponent('صيغة الشعار غير مدعومة — استخدم PNG أو JPG أو WebP'));
    }
    fs.writeFileSync(LOGO_PATH, req.file.buffer);
    store.setSetting('logo_mime', req.file.mimetype);
  }
  if (req.body.remove_logo === '1' && fs.existsSync(LOGO_PATH)) fs.unlinkSync(LOGO_PATH);
  if (req.body.hotel_name_ar) store.setSetting('hotel_name_ar', String(req.body.hotel_name_ar).trim());
  if (req.body.hotel_name_en) store.setSetting('hotel_name_en', String(req.body.hotel_name_en).trim());
  const hours = parseInt(req.body.lock_hours, 10);
  if (Number.isInteger(hours) && hours >= 1 && hours <= 720) store.setSetting('lock_hours', hours);
  store.setSetting('base_url', String(req.body.base_url || '').trim());
  const pw = String(req.body.new_password || '');
  if (pw) {
    if (pw.length < 6) {
      return res.redirect('/admin/settings?msg=' + encodeURIComponent('كلمة المرور يجب ألا تقل عن 6 أحرف'));
    }
    store.setSetting('admin_password_hash', bcrypt.hashSync(pw, 10));
  }
  res.redirect('/admin/settings?msg=' + encodeURIComponent('تم حفظ الإعدادات'));
});

app.listen(PORT, () => {
  console.log(`Hotel survey running on http://localhost:${PORT}`);
  console.log('Admin panel: /admin  (default password: admin123 — change it in Settings)');
});
