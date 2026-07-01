# Course Studio Full-Stack

Course Studio - Admin, O'qituvchi va O'quvchi rollari bilan ishlaydigan bepul onlayn ta'lim platformasi. To'lov tizimi qo'shilmagan.

## Stack

- Node.js 20 built-in HTTP server
- JSON faylga asoslangan lokal ma'lumotlar bazasi: `server/data/course-studio.json`
- Vanilla HTML/CSS/JavaScript SPA
- JWT-style token, RBAC guard, server-side file upload

## Ishga tushirish

```bash
cd /home/sanjar/course_studio_fullstack
cp .env.example .env
npm run dev
```

Brauzerda oching:

```text
http://localhost:3000
```

Demo loginlar:

```text
admin / admin12345
teacher / teacher123
student / student123
```

## Muhit o'zgaruvchilari

`.env.example` faylidan nusxa oling:

```env
PORT=3000
JWT_SECRET=change-this-long-random-secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin12345
```

Production uchun `JWT_SECRET` uzun va maxfiy bo'lishi shart. `ADMIN_PASSWORD` faqat birinchi seed paytida ishlatiladi.

## Client/server boundary

Client faqat `/api/*` endpointlariga so'rov yuboradi va tokenni `Authorization: Bearer ...` headerida jo'natadi. Parol hash qilish, rol tekshirish, kurs/dars/content yaratish, fayl saqlash va inline fayl berish serverda bajariladi.

Frontend OpenAI yoki boshqa maxfiy kalitlarni ishlatmaydi. Barcha maxfiy sozlamalar server `.env` faylida turishi kerak.

## Nimalar qo'shildi

- JWT asosida login/logout
- `admin`, `teacher`, `student` RBAC
- Admin tomonidan teacher/student yaratish, parolni qo'lda berish yoki avtomatik generatsiya qilish
- Admin statistikasi va audit log
- Teacher uchun o'z kurslari, o'z o'quvchilari va dars CRUD
- Kurs/dars ichida `+ Kontent`: rich text, link, file
- PDF, rasm va video inline preview; boshqa fayllar uchun yangi oynada ochish va yuklab olish linklari
- Student uchun ochilgan kurslar, progress checkbox, topshiriq matn/fayl yuborish

## Deployment

Oddiy Node hosting yetarli:

```bash
npm start
```

Server quyidagi papkalarga yozadi:

- `server/data/`
- `server/uploads/`

Deploy platformasida persistent disk kerak. Agar serverless platformaga joylasangiz, JSON fayl o'rniga PostgreSQL, MySQL yoki managed database ishlating.

## Keyin sozlanadigan joylar

- Model/database schema: `server/server.js` ichidagi `seedDb()` va array kolleksiyalar
- RBAC guardlar: `requireRole()` va `canManageCourse()`
- Upload cheklovlari: `parseMultipart()` chaqiriladigan `/api/lessons/:id/content` va `/api/lessons/:id/submissions`
- UI: `public/index.html`, `public/styles.css`, `public/app.js`

## Validation plan

1. Admin login qilib teacher va student yaratadi; student uchun parol avtomatik generatsiya qilinganini tekshiradi.
2. Teacher login qilib faqat o'z kurslari va biriktirilgan o'quvchilarini ko'radi.
3. Teacher kurs va dars yaratadi, `+ Kontent` orqali text/link/file qo'shadi.
4. PDF iframe ichida, rasm `<img>`, video `<video>` orqali ochilishini tekshiradi.
5. Student login qilib faqat enroll qilingan kursni ko'radi, darsni o'qilgan belgilaydi va progress o'zgaradi.
6. Student topshiriq yuboradi; teacher panelida submission ko'rinadi.
7. Ruxsatsiz API chaqiruvlar `401/403` qaytarishini tekshiradi.
