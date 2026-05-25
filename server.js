import express from 'express';
import { MongoClient } from 'mongodb';
import 'dotenv/config';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;
const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URL;
const mongoDbName = process.env.MONGODB_DB || 'love_diary';
const diaryCollectionName = process.env.MONGODB_COLLECTION || 'diaries';
const diaryId = 'main';
const localDiaryFile = process.env.DIARY_DATA_PATH || path.join(__dirname, 'data', 'diary.json');
const publicDir = path.join(__dirname, 'public');

let mongoClient;
let diaryCollection;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(publicDir));

function createDefaultDiary() {
  return {
    title: 'Nuestro diario',
    subtitle: 'Una historia de amor escrita entre dos voces',
    entries: [
      {
        id: randomUUID(),
        date: new Date().toISOString().slice(0, 10),
        author: 'Sara',
        emotion: 'Primer capítulo',
        text: 'Hoy empezamos a escribir esto juntos. Que cada página guarde lo mejor de nosotros.'
      }
    ]
  };
}

function normalizeDiary(diary = {}) {
  const fallback = createDefaultDiary();

  return {
    title: typeof diary.title === 'string' && diary.title.trim() ? diary.title.trim() : fallback.title,
    subtitle: typeof diary.subtitle === 'string' ? diary.subtitle.trim() : fallback.subtitle,
    entries: Array.isArray(diary.entries) ? diary.entries : fallback.entries
  };
}

async function ensureLocalDiary() {
  await fs.mkdir(path.dirname(localDiaryFile), { recursive: true });

  try {
    await fs.access(localDiaryFile);
  } catch {
    await fs.writeFile(localDiaryFile, JSON.stringify(createDefaultDiary(), null, 2), 'utf8');
  }
}

async function readDiaryFromFile() {
  await ensureLocalDiary();
  const raw = await fs.readFile(localDiaryFile, 'utf8');

  try {
    return normalizeDiary(JSON.parse(raw));
  } catch {
    return createDefaultDiary();
  }
}

async function saveDiaryToFile(diary) {
  await fs.mkdir(path.dirname(localDiaryFile), { recursive: true });
  const tempFile = `${localDiaryFile}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(normalizeDiary(diary), null, 2), 'utf8');
  await fs.rename(tempFile, localDiaryFile);
  return normalizeDiary(diary);
}

async function getDiaryCollection() {
  if (diaryCollection) {
    return diaryCollection;
  }

  if (!mongoClient) {
    if (!mongoUri) {
      throw new Error('Falta MONGODB_URI. Configura Atlas antes de arrancar la app.');
    }

    mongoClient = new MongoClient(mongoUri);
    await mongoClient.connect();
  }

  diaryCollection = mongoClient.db(mongoDbName).collection(diaryCollectionName);
  return diaryCollection;
}

async function readDiary() {
  if (!mongoUri) {
    return readDiaryFromFile();
  }

  const collection = await getDiaryCollection();
  const diary = await collection.findOne({ _id: diaryId });

  if (!diary) {
    const defaultDiary = createDefaultDiary();
    await collection.insertOne({ _id: diaryId, ...defaultDiary });
    return defaultDiary;
  }

  return normalizeDiary(diary);
}

async function saveDiary(diary) {
  if (!mongoUri) {
    return saveDiaryToFile(diary);
  }

  const collection = await getDiaryCollection();
  const normalizedDiary = normalizeDiary(diary);

  await collection.updateOne(
    { _id: diaryId },
    {
      $set: {
        title: normalizedDiary.title,
        subtitle: normalizedDiary.subtitle,
        entries: normalizedDiary.entries
      },
      $setOnInsert: { createdAt: new Date() }
    },
    { upsert: true }
  );

  return normalizedDiary;
}

app.get('/api/diary', async (_req, res) => {
  try {
    const diary = await readDiary();
    res.json(diary);
  } catch (error) {
    res.status(500).json({ message: 'No se pudo cargar el diario.' });
  }
});

app.put('/api/diary', async (req, res) => {
  try {
    const { title, subtitle } = req.body ?? {};
    const diary = await readDiary();
    const nextDiary = {
      ...diary,
      title: typeof title === 'string' ? title.trim().slice(0, 80) : diary.title,
      subtitle: typeof subtitle === 'string' ? subtitle.trim().slice(0, 180) : diary.subtitle
    };
    await saveDiary(nextDiary);
    res.json(nextDiary);
  } catch (error) {
    res.status(500).json({ message: 'No se pudo actualizar el diario.' });
  }
});

app.post('/api/entries', async (req, res) => {
  try {
    const { date, author, emotion, text } = req.body ?? {};
    if (![date, author, emotion, text].every(value => typeof value === 'string' && value.trim())) {
      return res.status(400).json({ message: 'Faltan campos para la entrada.' });
    }

    const diary = await readDiary();
    const entry = {
      id: crypto.randomUUID(),
      date: date.trim(),
      author: author.trim().slice(0, 40),
      emotion: emotion.trim().slice(0, 80),
      text: text.trim().slice(0, 5000)
    };

    diary.entries = [entry, ...(Array.isArray(diary.entries) ? diary.entries : [])];
    await saveDiary(diary);
    res.status(201).json(entry);
  } catch (error) {
    res.status(500).json({ message: 'No se pudo guardar la entrada.' });
  }
});

app.put('/api/entries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { date, author, emotion, text } = req.body ?? {};
    const diary = await readDiary();
    const entryIndex = diary.entries.findIndex(entry => entry.id === id);

    if (entryIndex === -1) {
      return res.status(404).json({ message: 'Entrada no encontrada.' });
    }

    diary.entries[entryIndex] = {
      ...diary.entries[entryIndex],
      date: typeof date === 'string' ? date.trim() : diary.entries[entryIndex].date,
      author: typeof author === 'string' ? author.trim().slice(0, 40) : diary.entries[entryIndex].author,
      emotion: typeof emotion === 'string' ? emotion.trim().slice(0, 80) : diary.entries[entryIndex].emotion,
      text: typeof text === 'string' ? text.trim().slice(0, 5000) : diary.entries[entryIndex].text
    };

    await saveDiary(diary);
    res.json(diary.entries[entryIndex]);
  } catch (error) {
    res.status(500).json({ message: 'No se pudo editar la entrada.' });
  }
});

app.delete('/api/entries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const diary = await readDiary();
    const nextEntries = diary.entries.filter(entry => entry.id !== id);

    if (nextEntries.length === diary.entries.length) {
      return res.status(404).json({ message: 'Entrada no encontrada.' });
    }

    diary.entries = nextEntries;
    await saveDiary(diary);
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ message: 'No se pudo borrar la entrada.' });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

async function startServer() {
  if (!mongoUri) {
    console.warn(`MONGODB_URI no definida; usando almacenamiento local en ${localDiaryFile}`);
  }

  await readDiary();

  app.listen(port, () => {
    console.log(`Diary app running on port ${port}`);
  });
}

startServer().catch(error => {
  console.error('Failed to start diary app:', error);
  process.exit(1);
});
