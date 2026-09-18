const API = '/api';

let toastTimer = null;

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 3200);
}

let STATUSES = [];
let TAGS = [];
let tasks = [];

function getBoardAlign() {
    try {
        return localStorage.getItem('boardAlign') || 'left';
    } catch {
        return 'left';
    }
}

function applyBoardAlign(align) {
    const board = document.getElementById('board');
    board.classList.remove('align-left', 'align-center', 'align-right');
    board.classList.add('align-' + align);
    document.querySelectorAll('.align-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.align === align);
    });
}

function setBoardAlign(align) {
    try {
        localStorage.setItem('boardAlign', align);
    } catch {
        /* localStorage недоступен, выравнивание просто не сохранится */
    }
    applyBoardAlign(align);
}

const COLUMN_WIDTH = 240;
const COLUMN_GAP = 16;

function fitBoardWidth() {
    const boardView = document.getElementById('board-view');
    const board = document.getElementById('board');
    const available = boardView.clientWidth;
    const maxCols = Math.max(1, Math.floor((available + COLUMN_GAP) / (COLUMN_WIDTH + COLUMN_GAP)));
    board.style.maxWidth = (maxCols * COLUMN_WIDTH + (maxCols - 1) * COLUMN_GAP) + 'px';
    board.style.margin = '0 auto';
}

let fitBoardWidthTimer = null;
window.addEventListener('resize', () => {
    clearTimeout(fitBoardWidthTimer);
    fitBoardWidthTimer = setTimeout(fitBoardWidth, 120);
});

async function api(path, options) {
    const res = await fetch(API + path, {
        headers: {'Content-Type': 'application/json'},
        ...options,
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`API ${path} failed: ${res.status} ${text}`);
    }
    if (res.status === 204) return null;
    return res.json();
}

async function loadBoard() {
    const data = await api('/board');
    STATUSES = data.statuses;
    TAGS = data.tags;
    tasks = data.tasks;
}

function getStatus(key) {
    return STATUSES.find(s => s.key === key) || STATUSES[0];
}

function getTag(key) {
    return TAGS.find(t => t.key === key);
}

function populateDatalists() {
    const tagList = document.getElementById('tag-options');
    tagList.innerHTML = TAGS.map(t => `<option value="${escapeHtml(t.label)}">`).join('');
    const statusList = document.getElementById('status-options');
    statusList.innerHTML = STATUSES.map(s => `<option value="${escapeHtml(s.label)}">`).join('');
}

function trashIcon(size) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>`;
}

function editIcon(size) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`;
}

function dragHandleIcon() {
    return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></svg>`;
}

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function escapeAttr(str) {
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function render() {
    const board = document.getElementById('board');
    board.innerHTML = '';
    fitBoardWidth();
    applyBoardAlign(getBoardAlign());
    document.getElementById('subtitle').textContent = tasks.length + ' задач';
    populateDatalists();

    STATUSES.forEach(st => {
        const col = document.createElement('div');
        col.className = 'column';
        col.dataset.status = st.key;

        const head = document.createElement('div');
        head.className = 'column-head';
        head.draggable = true;
        const items = tasks.filter(t => t.status === st.key);
        head.innerHTML = `
      <span class="column-drag-handle">${dragHandleIcon()}</span>
      <span class="dot" style="background:${st.color}"></span>
      <span class="column-title">${escapeHtml(st.label)}</span>
      <span class="column-count">${items.length}</span>
      <button class="column-delete" title="Удалить группу" onclick="deleteStatus('${st.key}')">${trashIcon(14)}</button>
    `;
        head.addEventListener('dragstart', onColumnDragStart);
        head.addEventListener('dragend', onColumnDragEnd);
        col.appendChild(head);

        const cardsWrap = document.createElement('div');
        cardsWrap.className = 'cards';

        if (items.length === 0) {
            const hint = document.createElement('div');
            hint.className = 'empty-hint';
            hint.textContent = 'пусто';
            cardsWrap.appendChild(hint);
        }

        items.forEach(task => {
            const card = document.createElement('div');
            card.className = 'card' + (st.key === 'done' ? ' done' : '');
            card.draggable = true;
            card.dataset.id = task.id;
            const tag = getTag(task.tag);
            if (tag) {
                card.style.setProperty('--card-accent', tag.text);
            }
            const tagHtml = tag
                ? `<span class="tag" style="background:${tag.bg};color:${tag.text}">${escapeHtml(tag.label)}</span>`
                : '<span></span>';
            card.innerHTML = `
        <p class="card-title">${escapeHtml(task.title)}</p>
        <div class="card-meta">
          ${tagHtml}
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="due">${escapeHtml(task.due || '')}</span>
            <button class="card-delete" title="Удалить задачу" onclick="event.stopPropagation(); deleteTask('${task.id}')">${trashIcon(13)}</button>
          </div>
        </div>
      `;
            card.addEventListener('click', () => openDetail(task.id));
            card.addEventListener('dragstart', onCardDragStart);
            card.addEventListener('dragend', onCardDragEnd);
            cardsWrap.appendChild(card);
        });

        col.appendChild(cardsWrap);

        col.addEventListener('dragover', onColumnDragOver);
        col.addEventListener('dragleave', onColumnDragLeave);
        col.addEventListener('drop', onColumnDrop);

        board.appendChild(col);
    });
}

let draggedId = null;
let draggedStatusKey = null;

function onCardDragStart(e) {
    e.stopPropagation();
    draggedId = e.currentTarget.dataset.id;
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function onCardDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    draggedId = null;
}

function onColumnDragStart(e) {
    draggedStatusKey = e.currentTarget.closest('.column').dataset.status;
    e.currentTarget.closest('.column').classList.add('dragging-column');
    e.dataTransfer.effectAllowed = 'move';
}

function onColumnDragEnd(e) {
    e.currentTarget.closest('.column').classList.remove('dragging-column');
    draggedStatusKey = null;
}

function onColumnDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
}

function onColumnDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

async function onColumnDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const targetStatus = e.currentTarget.dataset.status;

    if (draggedStatusKey) {
        if (draggedStatusKey === targetStatus) return;
        const fromIdx = STATUSES.findIndex(s => s.key === draggedStatusKey);
        const toIdx = STATUSES.findIndex(s => s.key === targetStatus);
        const [moved] = STATUSES.splice(fromIdx, 1);
        STATUSES.splice(toIdx, 0, moved);
        render();
        try {
            await api('/statuses/reorder', {method: 'PUT', body: JSON.stringify({keys: STATUSES.map(s => s.key)})});
        } catch (err) {
            console.error(err);
            showToast('Не удалось выполнить действие. Попробуйте ещё раз.');
            await refresh();
        }
        return;
    }

    if (draggedId) {
        const task = tasks.find(t => t.id === draggedId);
        if (task && task.status !== targetStatus) {
            task.status = targetStatus;
            render();
            try {
                await api(`/tasks/${draggedId}/move`, {method: 'PUT', body: JSON.stringify({status: targetStatus})});
            } catch (err) {
                console.error(err);
                showToast('Не удалось выполнить действие. Попробуйте ещё раз.');
                await refresh();
            }
        }
    }
}

async function refresh() {
    await loadBoard();
    render();
}

async function deleteTask(taskId) {
    tasks = tasks.filter(t => t.id !== taskId);
    render();
    try {
        await api(`/tasks/${taskId}`, {method: 'DELETE'});
    } catch (err) {
        console.error(err);
        showToast('Не удалось выполнить действие. Попробуйте ещё раз.');
        await refresh();
    }
}

async function deleteStatus(statusKey) {
    if (STATUSES.length <= 1) return;
    const status = getStatus(statusKey);
    const count = tasks.filter(t => t.status === statusKey).length;
    const msg = count > 0
        ? `Удалить группу «${status.label}» вместе с задачами (${count})?`
        : `Удалить группу «${status.label}»?`;
    if (!confirm(msg)) return;
    try {
        await api(`/statuses/${statusKey}`, {method: 'DELETE'});
        await refresh();
    } catch (err) {
        console.error(err);
        showToast('Не удалось выполнить действие. Попробуйте ещё раз.');
    }
}

function openModal() {
    populateDatalists();
    document.getElementById('overlay').classList.add('open');
    document.getElementById('input-title').focus();
}

function closeModal() {
    document.getElementById('overlay').classList.remove('open');
    document.getElementById('input-title').value = '';
    document.getElementById('input-due').value = '';
    document.getElementById('input-tag').value = '';
    document.getElementById('input-status').value = '';
}

async function addTask() {
    const title = document.getElementById('input-title').value.trim();
    if (!title) return;
    const tag = document.getElementById('input-tag').value.trim() || null;
    const due = document.getElementById('input-due').value.trim();
    const status = document.getElementById('input-status').value.trim() || null;

    try {
        await api('/tasks', {method: 'POST', body: JSON.stringify({title, tag, due, status})});
        await refresh();
        closeModal();
    } catch (err) {
        console.error(err);
        showToast('Не удалось выполнить действие. Попробуйте ещё раз.');
    }
}

document.getElementById('overlay').addEventListener('click', (e) => {
    if (e.target.id === 'overlay') closeModal();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});

function openDetail(taskId) {
    location.hash = '#/task/' + taskId;
}

function goToBoard() {
    location.hash = '';
}

function renderDetail(taskId) {
    const task = tasks.find(t => t.id === taskId);
    const card = document.getElementById('detail-card');
    if (!task) {
        card.innerHTML = '<p style="color:var(--text-secondary);font-size:13px;">Задача не найдена, возможно она была удалена.</p>';
        return;
    }
    const status = getStatus(task.status);
    const tag = getTag(task.tag);
    card.innerHTML = `
    <input class="detail-title" id="detail-title" value="${escapeAttr(task.title)}" placeholder="Название задачи">
    <div class="detail-row">
      <div class="detail-field">
        <label>Тег</label>
        <input type="text" id="detail-tag" list="tag-options" value="${escapeAttr(tag ? tag.label : '')}">
      </div>
      <div class="detail-field">
        <label>Статус</label>
        <input type="text" id="detail-status" list="status-options" value="${escapeAttr(status.label)}">
      </div>
      <div class="detail-field">
        <label>Дата</label>
        <input type="text" id="detail-due" value="${escapeAttr(task.due || '')}">
      </div>
    </div>
    <p class="detail-desc-label">Описание</p>
    <textarea class="detail-desc" id="detail-description" placeholder="Коротко опиши, что нужно сделать...">${escapeHtml(task.description || '')}</textarea>
    <div class="detail-footer">
      <button class="detail-delete" onclick="deleteTaskFromDetail('${task.id}')">${trashIcon(14)} Удалить задачу</button>
      <span class="saved-hint" id="saved-hint">Сохранено</span>
    </div>
  `;

    const titleEl = document.getElementById('detail-title');
    const tagEl = document.getElementById('detail-tag');
    const statusEl = document.getElementById('detail-status');
    const dueEl = document.getElementById('detail-due');
    const descEl = document.getElementById('detail-description');

    titleEl.addEventListener('change', () => saveDetail(task.id, {title: titleEl.value.trim() || task.title}));
    tagEl.addEventListener('change', () => saveDetail(task.id, {tag: tagEl.value.trim() || null}));
    statusEl.addEventListener('change', () => saveDetail(task.id, {status: statusEl.value || null}));
    dueEl.addEventListener('change', () => saveDetail(task.id, {due: dueEl.value.trim()}));
    descEl.addEventListener('change', () => saveDetail(task.id, {description: descEl.value}));
}

async function saveDetail(taskId, patch) {
    try {
        const updated = await api(`/tasks/${taskId}`, {method: 'PATCH', body: JSON.stringify(patch)});
        const idx = tasks.findIndex(t => t.id === taskId);
        if (idx !== -1) tasks[idx] = updated;
        if (patch.tag !== undefined || patch.status !== undefined) {
            await loadBoard();
        }
        populateDatalists();
        const hint = document.getElementById('saved-hint');
        if (hint) {
            hint.classList.add('show');
            setTimeout(() => hint.classList.remove('show'), 1200);
        }
    } catch (err) {
        console.error(err);
        showToast('Не удалось выполнить действие. Попробуйте ещё раз.');
    }
}

async function deleteTaskFromDetail(taskId) {
    if (!confirm('Удалить эту задачу?')) return;
    try {
        await api(`/tasks/${taskId}`, {method: 'DELETE'});
        tasks = tasks.filter(t => t.id !== taskId);
        goToBoard();
    } catch (err) {
        console.error(err);
        showToast('Не удалось выполнить действие. Попробуйте ещё раз.');
    }
}

let entities = [];

async function loadKnowledge() {
    const data = await api('/knowledge');
    entities = data.entities;
}

function renderKnowledge() {
    const grid = document.getElementById('entities-grid');
    grid.innerHTML = '';
    const commandCount = entities.reduce((sum, e) => sum + e.items.length, 0);
    document.getElementById('knowledge-subtitle').textContent =
        entities.length + ' скиллов, ' + commandCount + ' команд';

    if (entities.length === 0) {
        const hint = document.createElement('div');
        hint.className = 'empty-hint';
        hint.textContent = 'пока нет скиллов — добавь первый';
        grid.appendChild(hint);
        return;
    }

    entities.forEach(entity => {
        const card = document.createElement('div');
        card.className = 'entity-card';
        card.innerHTML = `
      <div class="entity-card-head">
        <p class="entity-card-title">${escapeHtml(entity.name)}</p>
        <div class="entity-card-actions">
          <button class="card-delete" title="Редактировать скилл" onclick="openEntityModal('${entity.id}')">${editIcon(13)}</button>
          <button class="card-delete" title="Удалить скилл" onclick="deleteEntity('${entity.id}')">${trashIcon(13)}</button>
        </div>
      </div>
      ${entity.description ? `<p class="entity-card-desc">${escapeHtml(entity.description)}</p>` : ''}
      <div class="entity-items" id="entity-items-${entity.id}"></div>
      <button class="entity-add-item" onclick="openItemModal('${entity.id}')">+ команда</button>
    `;
        const itemsWrap = card.querySelector('.entity-items');
        if (entity.items.length === 0) {
            const hint = document.createElement('div');
            hint.className = 'empty-hint';
            hint.textContent = 'пока нет команд';
            itemsWrap.appendChild(hint);
        }
        entity.items.forEach(item => {
            const row = document.createElement('div');
            row.className = 'entity-item-row';
            row.innerHTML = `
        <div class="entity-item-head">
          <span class="entity-item-name">${escapeHtml(item.name)}</span>
          <div class="entity-card-actions">
            <button class="card-delete" title="Редактировать команду" onclick="event.stopPropagation(); openItemModal('${entity.id}', '${item.id}')">${editIcon(12)}</button>
            <button class="card-delete" title="Удалить команду" onclick="event.stopPropagation(); deleteItem('${item.id}')">${trashIcon(12)}</button>
          </div>
        </div>
        <p class="entity-item-desc" hidden>${escapeHtml(item.description || 'без описания')}</p>
      `;
            row.querySelector('.entity-item-head').addEventListener('click', () => {
                row.querySelector('.entity-item-desc').hidden = !row.querySelector('.entity-item-desc').hidden;
            });
            itemsWrap.appendChild(row);
        });
        grid.appendChild(card);
    });
}

async function refreshKnowledge() {
    await loadKnowledge();
    renderKnowledge();
}

let editingEntityId = null;

function openEntityModal(entityId) {
    editingEntityId = entityId || null;
    const entity = editingEntityId ? entities.find(e => e.id === editingEntityId) : null;
    document.getElementById('entity-modal-title').textContent = entity ? 'Редактировать скилл' : 'Новый скилл';
    document.getElementById('entity-submit-btn').textContent = entity ? 'Сохранить' : 'Добавить';
    document.getElementById('input-entity-name').value = entity ? entity.name : '';
    document.getElementById('input-entity-description').value = entity ? entity.description : '';
    document.getElementById('entity-overlay').classList.add('open');
    document.getElementById('input-entity-name').focus();
}

function closeEntityModal() {
    editingEntityId = null;
    document.getElementById('entity-overlay').classList.remove('open');
    document.getElementById('input-entity-name').value = '';
    document.getElementById('input-entity-description').value = '';
}

async function addEntity() {
    const name = document.getElementById('input-entity-name').value.trim();
    if (!name) return;
    const description = document.getElementById('input-entity-description').value.trim();
    try {
        if (editingEntityId) {
            await api(`/entities/${editingEntityId}`, {method: 'PATCH', body: JSON.stringify({name, description})});
        } else {
            await api('/entities', {method: 'POST', body: JSON.stringify({name, description})});
        }
        await refreshKnowledge();
        closeEntityModal();
    } catch (err) {
        console.error(err);
        showToast('Не удалось выполнить действие. Попробуйте ещё раз.');
    }
}

async function deleteEntity(entityId) {
    if (!confirm('Удалить скилл вместе со всеми его командами?')) return;
    try {
        await api(`/entities/${entityId}`, {method: 'DELETE'});
        await refreshKnowledge();
    } catch (err) {
        console.error(err);
        showToast('Не удалось выполнить действие. Попробуйте ещё раз.');
    }
}

let currentEntityIdForItem = null;
let editingItemId = null;

function openItemModal(entityId, itemId) {
    currentEntityIdForItem = entityId;
    editingItemId = itemId || null;
    const entity = entities.find(e => e.id === entityId);
    const item = editingItemId ? entity?.items.find(i => i.id === editingItemId) : null;
    document.getElementById('item-modal-title').textContent = item ? 'Редактировать команду' : 'Новая команда';
    document.getElementById('item-submit-btn').textContent = item ? 'Сохранить' : 'Добавить';
    document.getElementById('input-item-name').value = item ? item.name : '';
    document.getElementById('input-item-description').value = item ? item.description : '';
    document.getElementById('item-overlay').classList.add('open');
    document.getElementById('input-item-name').focus();
}

function closeItemModal() {
    currentEntityIdForItem = null;
    editingItemId = null;
    document.getElementById('item-overlay').classList.remove('open');
    document.getElementById('input-item-name').value = '';
    document.getElementById('input-item-description').value = '';
}

async function addItem() {
    const name = document.getElementById('input-item-name').value.trim();
    if (!name || !currentEntityIdForItem) return;
    const description = document.getElementById('input-item-description').value.trim();
    try {
        if (editingItemId) {
            await api(`/items/${editingItemId}`, {method: 'PATCH', body: JSON.stringify({name, description})});
        } else {
            await api(`/entities/${currentEntityIdForItem}/items`, {
                method: 'POST',
                body: JSON.stringify({name, description}),
            });
        }
        await refreshKnowledge();
        closeItemModal();
    } catch (err) {
        console.error(err);
        showToast('Не удалось выполнить действие. Попробуйте ещё раз.');
    }
}

async function deleteItem(itemId) {
    try {
        await api(`/items/${itemId}`, {method: 'DELETE'});
        await refreshKnowledge();
    } catch (err) {
        console.error(err);
        showToast('Не удалось выполнить действие. Попробуйте ещё раз.');
    }
}

document.getElementById('entity-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'entity-overlay') closeEntityModal();
});
document.getElementById('item-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'item-overlay') closeItemModal();
});

async function handleRoute() {
    const taskMatch = location.hash.match(/^#\/task\/(.+)$/);
    const isKnowledge = location.hash === '#/knowledge';
    const boardView = document.getElementById('board-view');
    const detailView = document.getElementById('detail-view');
    const knowledgeView = document.getElementById('knowledge-view');

    boardView.classList.add('hidden');
    detailView.classList.add('hidden');
    knowledgeView.classList.add('hidden');

    if (taskMatch) {
        detailView.classList.remove('hidden');
        renderDetail(taskMatch[1]);
    } else if (isKnowledge) {
        knowledgeView.classList.remove('hidden');
        await refreshKnowledge();
    } else {
        boardView.classList.remove('hidden');
        render();
    }
}

window.addEventListener('hashchange', handleRoute);
(async function init() {
    await loadBoard();
    await handleRoute();
})();
