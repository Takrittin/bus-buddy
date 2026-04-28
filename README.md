# BusBuddy

## วิธี Run Project หลัง Pull Code

### 1. Install dependencies

```bash
npm install
```

### 2. สร้างไฟล์ env

สร้างไฟล์ `backend/.env`

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/busbuddy-db"
PORT=3001
WEB_URL="http://localhost:3000"
```

ถ้าจะใช้ AI หรือ Premium payment ให้เพิ่มใน `backend/.env`

```env
GOOGLE_AI_API_KEY="your_google_ai_key"
GOOGLE_AI_MODEL="gemini-2.5-flash"
STRIPE_SECRET_KEY="your_stripe_secret_key"
STRIPE_PREMIUM_CURRENCY="thb"
PREMIUM_MONTHLY_PRICE_THB="99"
PREMIUM_WEEKLY_PRICE_THB="39"
```

สร้างไฟล์ `frontend/.env.local`

```env
NEXT_PUBLIC_API_URL="http://localhost:3001"
NEXT_PUBLIC_LONGDOMAP_KEY="your_longdo_map_key"
```

### 3. เตรียม database

เปิด PostgreSQL ก่อน แล้วรัน:

```bash
npm run prisma:generate
npm run prisma:push
```

### 4. Run backend

เปิด terminal แรก:

```bash
cd backend
npm run start:dev
```

Backend จะรันที่:

```text
http://localhost:3001
```

### 5. Run frontend

เปิด terminal ที่สอง:

```bash
cd frontend
npm run dev
```

เปิดเว็บที่:

```text
http://localhost:3000
```

### 6. Build production

```bash
npm run build -w backend
npm run build -w frontend
```
