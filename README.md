# Course Studio Web

Bu Flutter emas, oddiy HTML/CSS/JavaScript versiya.

## Ishga tushirish

Eng oson yo'l:

```bash
cd /home/sanjar/course_studio_web
python3 -m http.server 8080
```

Keyin brauzerda oching:

```text
http://localhost:8080
```

Yoki `index.html` faylini brauzerda to'g'ridan-to'g'ri ochish ham mumkin.

## Nimalar ishlaydi

- Yangi kurs yaratish, tahrirlash, o'chirish
- Dars mavzularini qo'shish, tahrirlash, o'chirish
- PDF, Word, PPT, Excel, ZIP va boshqa fayllarni biriktirish
- YouTube linkni ilova ichida iframe orqali ko'rsatish
- Matnli izoh va dars tavsifi
- Drag & drop orqali dars tartibini o'zgartirish
- Kurs qidirish
- O'quvchi rejimida o'qilgan mavzuni belgilash
- Light/Dark mode
- Ma'lumotlarni `localStorage`da saqlash
- JSON export

## Muhim eslatma

Bu statik sayt. Backend yo'q, shuning uchun ma'lumotlar faqat brauzer `localStorage`ida saqlanadi. Fayllar ham shu sessiyada object URL orqali ochiladi. Production uchun backend, real login va server storage kerak bo'ladi.
