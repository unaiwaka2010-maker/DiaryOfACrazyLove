const diaryTitle = document.getElementById('titleDisplay');
const diarySubtitle = document.getElementById('subtitleDisplay');
const statusBadge = document.getElementById('statusBadge');
const entryCount = document.getElementById('entryCount');
const entriesList = document.getElementById('entriesList');
const entryTemplate = document.getElementById('entryTemplate');
const entryForm = document.getElementById('entryForm');
const coverForm = document.getElementById('coverForm');
const saveDiaryBtn = document.getElementById('saveDiaryBtn');
const newEntryBtn = document.getElementById('newEntryBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const entryIdInput = document.getElementById('entryId');
const dateInput = document.getElementById('dateInput');
const authorInput = document.getElementById('authorInput');
const emotionInput = document.getElementById('emotionInput');
const textInput = document.getElementById('textInput');
const coverTitleInput = document.getElementById('coverTitleInput');
const coverSubtitleInput = document.getElementById('coverSubtitleInput');

const state = {
  diary: null
};

// Solicitar permiso para notificaciones
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

// Mostrar notificación
function showNotification(title, options = {}) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      ...options
    });
  }
}

function setStatus(message, tone = 'neutral') {
  statusBadge.textContent = message;
  statusBadge.dataset.tone = tone;
}

function formatDate(dateValue) {
  if (!dateValue) return '';
  const date = new Date(`${dateValue}T00:00:00`);
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(date);
}

function resetEntryForm() {
  entryIdInput.value = '';
  entryForm.reset();
  dateInput.value = new Date().toISOString().slice(0, 10);
  authorInput.value = '';
  emotionInput.value = '';
  textInput.value = '';
  newEntryBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function populateEntryForm(entry) {
  entryIdInput.value = entry.id;
  dateInput.value = entry.date;
  authorInput.value = entry.author;
  emotionInput.value = entry.emotion;
  textInput.value = entry.text;
}

function renderDiary(diary) {
  state.diary = diary;
  diaryTitle.textContent = diary.title || 'Nuestro diario';
  diarySubtitle.textContent = diary.subtitle || '';
  coverTitleInput.value = diary.title || '';
  coverSubtitleInput.value = diary.subtitle || '';
  entryCount.textContent = `${diary.entries.length} entrada${diary.entries.length === 1 ? '' : 's'}`;

  entriesList.innerHTML = '';

  if (!diary.entries.length) {
    entriesList.innerHTML = '<p class="notes">Aún no hay capítulos. Escribe el primero desde el panel de la izquierda.</p>';
    return;
  }

  for (const entry of diary.entries) {
    const node = entryTemplate.content.cloneNode(true);
    const article = node.querySelector('.entry-item');
    node.querySelector('.entry-date').textContent = formatDate(entry.date);
    node.querySelector('.entry-author').textContent = entry.author;
    node.querySelector('.entry-emotion').textContent = entry.emotion;
    node.querySelector('.entry-text').textContent = entry.text;

    node.querySelector('.entry-edit').addEventListener('click', () => {
      populateEntryForm(entry);
      setStatus(`Editando capítulo de ${entry.author}`, 'info');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    node.querySelector('.entry-delete').addEventListener('click', async () => {
      const confirmed = window.confirm(`¿Borrar la entrada de ${entry.author} del ${entry.date}?`);
      if (!confirmed) return;
      await deleteEntry(entry.id);
    });

    article.dataset.id = entry.id;
    entriesList.appendChild(node);
  }
}

async function loadDiary() {
  setStatus('Cargando...', 'neutral');
  const response = await fetch('/api/diary');
  if (!response.ok) {
    throw new Error('No se pudo cargar el diario');
  }
  const diary = await response.json();
  renderDiary(diary);
  setStatus('Sincronizado', 'success');
}

async function saveCover(event) {
  event?.preventDefault();
  setStatus('Guardando portada...', 'neutral');
  const response = await fetch('/api/diary', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: coverTitleInput.value,
      subtitle: coverSubtitleInput.value
    })
  });

  if (!response.ok) {
    setStatus('No se pudo guardar', 'error');
    return;
  }

  const diary = await response.json();
  renderDiary(diary);
  setStatus('Portada guardada', 'success');
}

async function saveEntry(event) {
  event.preventDefault();
  const payload = {
    date: dateInput.value,
    author: authorInput.value,
    emotion: emotionInput.value,
    text: textInput.value
  };
  const entryId = entryIdInput.value;
  const method = entryId ? 'PUT' : 'POST';
  const url = entryId ? `/api/entries/${entryId}` : '/api/entries';

  setStatus(entryId ? 'Actualizando entrada...' : 'Guardando entrada...', 'neutral');

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    setStatus(error?.message || 'No se pudo guardar', 'error');
    return;
  }

  const diary = await fetch('/api/diary').then(res => res.json());
  renderDiary(diary);
  resetEntryForm();
  setStatus('Entrada guardada', 'success');
  
  // Mostrar notificación
  const author = authorInput.value || 'Sara y Unai';
  showNotification('💕 Nueva entrada guardada', {
    body: `${author} ha escrito en el diario: "${emotionInput.value}"`,
    tag: 'diary-entry',
    requireInteraction: false
  });
}

async function deleteEntry(id) {
  setStatus('Borrando entrada...', 'neutral');
  const response = await fetch(`/api/entries/${id}`, { method: 'DELETE' });
  if (!response.ok && response.status !== 204) {
    setStatus('No se pudo borrar', 'error');
    return;
  }
  const diary = await fetch('/api/diary').then(res => res.json());
  renderDiary(diary);
  setStatus('Entrada borrada', 'success');
}

// Debounce para input del cover
let coverDebounceTimer;
function debounceCoverUpdate() {
  clearTimeout(coverDebounceTimer);
  coverDebounceTimer = setTimeout(() => {
    diaryTitle.textContent = coverTitleInput.value || 'Nuestro diario';
    diarySubtitle.textContent = coverSubtitleInput.value || '';
  }, 200);
}

entryForm.addEventListener('submit', saveEntry);
coverForm.addEventListener('input', debounceCoverUpdate);
saveDiaryBtn.addEventListener('click', saveCover);
newEntryBtn.addEventListener('click', resetEntryForm);
cancelEditBtn.addEventListener('click', resetEntryForm);

loadDiary().catch(error => {
  console.error(error);
  setStatus('Error al cargar', 'error');
});

// Solicitar permiso para notificaciones al cargar
requestNotificationPermission();

dateInput.value = new Date().toISOString().slice(0, 10);
