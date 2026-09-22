const API = '/api';

let toastTimer = null;

function showToast(message, type = 'error') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.remove('hidden', 'success', 'error');
    toast.classList.add(type);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 3200);
}

let STATUSES = [];
let QUEUES = [];
let tasks = [];

function currentAlignTarget() {
    return location.hash === '#/knowledge' ? 'knowledge' : 'board';
}

function getAlign(target) {
    try {
        return localStorage.getItem(target + 'Align') || 'left';
    } catch {
        return 'left';
    }
}

function applyAlign() {
    const target = currentAlignTarget();
    const align = getAlign(target);
    if (target === 'board') {
        const board = document.getElementById('board');
        board.classList.remove('align-left', 'align-center', 'align-right');
        board.classList.add('align-' + align);
    } else {
        document.querySelectorAll('.topics-grid').forEach(grid => {
            grid.classList.remove('align-left', 'align-center', 'align-right');
            grid.classList.add('align-' + align);
        });
    }
    document.querySelectorAll('#align-control .align-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.align === align);
    });
}

function setAlign(align) {
    const target = currentAlignTarget();
    try {
        localStorage.setItem(target + 'Align', align);
    } catch {
        /* localStorage недоступен, выравнивание просто не сохранится */
    }
    applyAlign();
}

const COLUMN_WIDTH = 240;
const COLUMN_GAP = 16;

function fitBoardWidth() {
    const boardView = document.getElementById('board-view');
    const board = document.getElementById('board');
    const switcher = document.getElementById('queue-switcher');
    const available = boardView.clientWidth;
    const maxCols = Math.max(1, Math.floor((available + COLUMN_GAP) / (COLUMN_WIDTH + COLUMN_GAP)));
    const width = (maxCols * COLUMN_WIDTH + (maxCols - 1) * COLUMN_GAP) + 'px';
    board.style.maxWidth = width;
    board.style.margin = '0 auto';
    switcher.style.maxWidth = width;
    switcher.style.margin = '0 auto 16px';
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
    QUEUES = data.queues;
    tasks = data.tasks;
}

function getStatus(key) {
    return STATUSES.find(s => s.key === key) || STATUSES[0];
}

function getQueue(key) {
    return QUEUES.find(q => q.key === key);
}

function getBoardActiveQueue() {
    let saved = null;
    try {
        saved = localStorage.getItem('boardActiveQueue');
    } catch {
        /* localStorage недоступен */
    }
    if (saved && QUEUES.some(q => q.key === saved)) return saved;
    return QUEUES[0] ? QUEUES[0].key : null;
}

function setBoardActiveQueue(key) {
    try {
        localStorage.setItem('boardActiveQueue', key);
    } catch {
        /* localStorage недоступен, выбор просто не сохранится */
    }
    render();
}

function renderQueueSwitcher() {
    const switcher = document.getElementById('queue-switcher');
    if (QUEUES.length === 0) {
        switcher.classList.add('hidden');
        switcher.innerHTML = '';
        return;
    }
    switcher.classList.remove('hidden');
    const active = getBoardActiveQueue();
    switcher.innerHTML = QUEUES.map(q => `
    <button type="button" class="range-btn${q.key === active ? ' active' : ''}" onclick="setBoardActiveQueue('${q.key}')">${escapeHtml(q.label)}</button>
  `).join('');
}

function populateDatalists() {
    const queueList = document.getElementById('queue-options');
    queueList.innerHTML = QUEUES.map(q => `<option value="${escapeHtml(q.label)}">`).join('');
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
    applyAlign();
    renderQueueSwitcher();
    const activeQueue = getBoardActiveQueue();
    const visibleTasks = activeQueue ? tasks.filter(t => t.queue === activeQueue) : [];
    document.getElementById('subtitle').textContent = visibleTasks.length + ' задач';
    populateDatalists();

    STATUSES.forEach(st => {
        const col = document.createElement('div');
        col.className = 'column';
        col.dataset.status = st.key;

        const head = document.createElement('div');
        head.className = 'column-head';
        head.draggable = true;
        const items = visibleTasks.filter(t => t.status === st.key);
        head.innerHTML = `
      <span class="column-drag-handle">${dragHandleIcon()}</span>
      <span class="dot" style="background:${st.color}"></span>
      <span class="column-title" title="Клик — переименовать" onclick="event.stopPropagation(); startRenameStatus(this, '${st.key}')">${escapeHtml(st.label)}</span>
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
            card.innerHTML = `
        <p class="card-title">${escapeHtml(task.title)}</p>
        <div class="card-meta">
          <span class="task-key">TASK-${task.number}</span>
          <button class="card-delete" title="Удалить задачу" onclick="event.stopPropagation(); deleteTask('${task.id}')">${trashIcon(13)}</button>
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

function startRenameStatus(titleEl, statusKey) {
    const status = getStatus(statusKey);
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'column-title-input';
    input.value = status.label;
    titleEl.replaceWith(input);
    input.focus();
    input.select();

    let done = false;
    const finish = async (commit) => {
        if (done) return;
        done = true;
        const newLabel = input.value.trim();
        if (commit && newLabel && newLabel !== status.label) {
            try {
                await api(`/statuses/${statusKey}`, {method: 'PATCH', body: JSON.stringify({label: newLabel})});
                await refresh();
                return;
            } catch (err) {
                console.error(err);
                showToast('Не удалось переименовать статус. Попробуйте ещё раз.');
            }
        }
        render();
    };
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') {
            done = true;
            render();
        }
    });
}

function openModal() {
    populateDatalists();
    const activeQueue = getQueue(getBoardActiveQueue());
    document.getElementById('input-queue').value = activeQueue ? activeQueue.label : '';
    document.getElementById('overlay').classList.add('open');
    document.getElementById('input-title').focus();
}

function closeModal() {
    document.getElementById('overlay').classList.remove('open');
    document.getElementById('input-title').value = '';
    document.getElementById('input-queue').value = '';
    document.getElementById('input-status').value = '';
}

async function addTask() {
    const title = document.getElementById('input-title').value.trim();
    const queue = document.getElementById('input-queue').value.trim();
    if (!title || !queue) return;
    const status = document.getElementById('input-status').value.trim() || null;

    try {
        await api('/tasks', {method: 'POST', body: JSON.stringify({title, queue, status})});
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
const MODAL_CLOSERS = {
    'overlay': closeModal,
    'topic-overlay': closeTopicModal,
    'concept-overlay': closeConceptModal,
    'block-overlay': closeBlockModal,
};

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    for (const [overlayId, close] of Object.entries(MODAL_CLOSERS)) {
        if (document.getElementById(overlayId).classList.contains('open')) {
            close();
            return;
        }
    }
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
    const queue = getQueue(task.queue);
    card.innerHTML = `
    <input class="detail-title" id="detail-title" value="${escapeAttr(task.title)}" placeholder="Название задачи">
    <p class="detail-key mono">TASK-${task.number}</p>
    <div class="detail-row">
      <div class="detail-field">
        <label for="detail-queue">Очередь</label>
        <input type="text" id="detail-queue" list="queue-options" value="${escapeAttr(queue ? queue.label : '')}">
      </div>
      <div class="detail-field">
        <label for="detail-status">Статус</label>
        <input type="text" id="detail-status" list="status-options" value="${escapeAttr(status.label)}">
      </div>
    </div>
    <label for="detail-description" class="detail-desc-label">Описание</label>
    <textarea class="detail-desc" id="detail-description" placeholder="Коротко опиши, что нужно сделать...">${escapeHtml(task.description || '')}</textarea>
    <div class="detail-footer">
      <button class="detail-delete" onclick="deleteTaskFromDetail('${task.id}')">${trashIcon(14)} Удалить задачу</button>
      <span class="saved-hint" id="saved-hint">Сохранено</span>
    </div>
  `;

    const titleEl = document.getElementById('detail-title');
    const queueEl = document.getElementById('detail-queue');
    const statusEl = document.getElementById('detail-status');
    const descEl = document.getElementById('detail-description');

    titleEl.addEventListener('change', () => saveDetail(task.id, {title: titleEl.value.trim() || task.title}));
    queueEl.addEventListener('change', () => saveDetail(task.id, {queue: queueEl.value.trim() || null}));
    statusEl.addEventListener('change', () => saveDetail(task.id, {status: statusEl.value || null}));
    descEl.addEventListener('change', () => saveDetail(task.id, {description: descEl.value}));
}

async function saveDetail(taskId, patch) {
    try {
        const updated = await api(`/tasks/${taskId}`, {method: 'PATCH', body: JSON.stringify(patch)});
        const idx = tasks.findIndex(t => t.id === taskId);
        if (idx !== -1) tasks[idx] = updated;
        if (patch.queue !== undefined || patch.status !== undefined) {
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

let knowledgeBlocks = [];
let ungroupedTopics = [];

function allTopics() {
    return knowledgeBlocks.flatMap(b => b.topics).concat(ungroupedTopics);
}

async function loadKnowledge() {
    const data = await api('/knowledge');
    knowledgeBlocks = data.blocks;
    ungroupedTopics = data.topics;
}

function renderTopicCard(topic) {
    const card = document.createElement('div');
    card.className = 'topic-card';
    card.draggable = true;
    card.dataset.topicId = topic.id;
    card.addEventListener('dragstart', onTopicDragStart);
    card.addEventListener('dragend', onTopicDragEnd);
    card.addEventListener('dragover', onTopicDragOver);
    card.addEventListener('dragleave', onTopicDragLeave);
    card.addEventListener('drop', onTopicDrop);
    card.innerHTML = `
      <div class="topic-card-head">
        <p class="topic-card-title">${escapeHtml(topic.name)}</p>
        <div class="topic-card-actions">
          <button class="card-delete" title="Редактировать тему" onclick="openTopicModal('${topic.id}')">${editIcon(13)}</button>
          <button class="card-delete" title="Удалить тему" onclick="deleteTopic('${topic.id}')">${trashIcon(13)}</button>
        </div>
      </div>
      ${topic.description ? `<p class="topic-card-desc">${escapeHtml(topic.description)}</p>` : ''}
      <div class="topic-concepts" id="topic-concepts-${topic.id}"></div>
      <button class="topic-add-concept" onclick="openConceptModal('${topic.id}')">+ понятие</button>
    `;
    const conceptsWrap = card.querySelector('.topic-concepts');
    if (topic.concepts.length === 0) {
        const hint = document.createElement('div');
        hint.className = 'empty-hint';
        hint.textContent = 'пока нет понятий';
        conceptsWrap.appendChild(hint);
    }
    topic.concepts.forEach(concept => {
        const row = document.createElement('div');
        row.className = 'concept-row';
        row.draggable = true;
        row.dataset.conceptId = concept.id;
        row.addEventListener('dragstart', onConceptDragStart);
        row.addEventListener('dragend', onConceptDragEnd);
        row.addEventListener('dragover', onConceptRowDragOver);
        row.addEventListener('dragleave', onConceptRowDragLeave);
        row.addEventListener('drop', onConceptRowDrop);
        row.innerHTML = `
        <div class="concept-head">
          <span class="concept-name">${escapeHtml(concept.name)}</span>
          <div class="topic-card-actions">
            <button class="card-delete" title="Редактировать понятие" onclick="event.stopPropagation(); openConceptModal('${topic.id}', '${concept.id}')">${editIcon(12)}</button>
            <button class="card-delete" title="Удалить понятие" onclick="event.stopPropagation(); deleteConcept('${concept.id}')">${trashIcon(12)}</button>
          </div>
        </div>
        <p class="concept-desc" hidden>${escapeHtml(concept.description || 'без описания')}</p>
      `;
        row.querySelector('.concept-head').addEventListener('click', () => {
            row.querySelector('.concept-desc').hidden = !row.querySelector('.concept-desc').hidden;
        });
        conceptsWrap.appendChild(row);
    });
    return card;
}

function renderKnowledge() {
    const content = document.getElementById('knowledge-content');
    content.innerHTML = '';
    const topicCount = allTopics().length;
    const conceptCount = allTopics().reduce((sum, t) => sum + t.concepts.length, 0);
    document.getElementById('subtitle').textContent = topicCount + ' тем, ' + conceptCount + ' понятий';

    if (topicCount === 0 && knowledgeBlocks.length === 0) {
        const hint = document.createElement('div');
        hint.className = 'empty-hint';
        hint.textContent = 'пока нет тем — добавь первую';
        content.appendChild(hint);
        return;
    }

    knowledgeBlocks.forEach(block => {
        const section = document.createElement('div');
        section.className = 'block-section';
        section.dataset.blockId = block.id;
        section.innerHTML = `
      <div class="block-section-head">
        <div class="block-section-heading" draggable="true">
          <span class="block-section-dot"></span>
          <p class="block-section-title">${escapeHtml(block.name)}</p>
          <span class="block-section-count">${block.topics.length}</span>
        </div>
        <div class="block-section-actions">
          <button class="card-delete" title="Переименовать блок" onclick="openBlockModal('${block.id}')">${editIcon(13)}</button>
          <button class="card-delete" title="Удалить блок" onclick="deleteBlock('${block.id}')">${trashIcon(13)}</button>
        </div>
      </div>
      <div class="topics-grid"></div>
    `;
        section.querySelector('.block-section-heading').addEventListener('dragstart', onBlockDragStart);
        section.querySelector('.block-section-heading').addEventListener('dragend', onBlockDragEnd);
        section.addEventListener('dragover', onBlockSectionDragOver);
        section.addEventListener('dragleave', onBlockSectionDragLeave);
        section.addEventListener('drop', onBlockSectionDrop);
        const grid = section.querySelector('.topics-grid');
        if (block.topics.length === 0) {
            const hint = document.createElement('div');
            hint.className = 'empty-hint';
            hint.textContent = 'пока нет тем в этом блоке';
            grid.appendChild(hint);
        }
        block.topics.forEach(topic => grid.appendChild(renderTopicCard(topic)));
        content.appendChild(section);
    });

    if (ungroupedTopics.length > 0) {
        const section = document.createElement('div');
        section.className = 'block-section';
        section.dataset.blockId = '';
        section.innerHTML = `
      <div class="block-section-head">
        <div class="block-section-heading">
          <span class="block-section-dot muted"></span>
          <p class="block-section-title">Без блока</p>
          <span class="block-section-count">${ungroupedTopics.length}</span>
        </div>
      </div>
      <div class="topics-grid"></div>
    `;
        section.addEventListener('dragover', onBlockSectionDragOver);
        section.addEventListener('dragleave', onBlockSectionDragLeave);
        section.addEventListener('drop', onBlockSectionDrop);
        const grid = section.querySelector('.topics-grid');
        ungroupedTopics.forEach(topic => grid.appendChild(renderTopicCard(topic)));
        content.appendChild(section);
    }

    applyAlign();
}

async function refreshKnowledge() {
    await loadKnowledge();
    renderKnowledge();
}

let editingTopicId = null;

function fillBlockSelect(selectedBlockId) {
    const select = document.getElementById('input-topic-block');
    select.innerHTML = '<option value="">без блока</option>';
    knowledgeBlocks.forEach(block => {
        const option = document.createElement('option');
        option.value = block.id;
        option.textContent = block.name;
        if (block.id === selectedBlockId) option.selected = true;
        select.appendChild(option);
    });
}

function openTopicModal(topicId) {
    editingTopicId = topicId || null;
    const topic = editingTopicId ? allTopics().find(t => t.id === editingTopicId) : null;
    document.getElementById('topic-modal-title').textContent = topic ? 'Редактировать тему' : 'Новая тема';
    document.getElementById('topic-submit-btn').textContent = topic ? 'Сохранить' : 'Добавить';
    document.getElementById('input-topic-name').value = topic ? topic.name : '';
    document.getElementById('input-topic-description').value = topic ? topic.description : '';
    fillBlockSelect(topic ? topic.block_id : null);
    document.getElementById('topic-overlay').classList.add('open');
    document.getElementById('input-topic-name').focus();
}

function closeTopicModal() {
    editingTopicId = null;
    document.getElementById('topic-overlay').classList.remove('open');
    document.getElementById('input-topic-name').value = '';
    document.getElementById('input-topic-description').value = '';
}

async function addTopic() {
    const name = document.getElementById('input-topic-name').value.trim();
    if (!name) return;
    const description = document.getElementById('input-topic-description').value.trim();
    const block_id = document.getElementById('input-topic-block').value || null;
    try {
        if (editingTopicId) {
            await api(`/topics/${editingTopicId}`, {method: 'PATCH', body: JSON.stringify({name, description, block_id})});
        } else {
            await api('/topics', {method: 'POST', body: JSON.stringify({name, description, block_id})});
        }
        await refreshKnowledge();
        closeTopicModal();
    } catch (err) {
        console.error(err);
        showToast('Не удалось выполнить действие. Попробуйте ещё раз.');
    }
}

async function deleteTopic(topicId) {
    if (!confirm('Удалить тему вместе со всеми её понятиями?')) return;
    try {
        await api(`/topics/${topicId}`, {method: 'DELETE'});
        await refreshKnowledge();
    } catch (err) {
        console.error(err);
        showToast('Не удалось выполнить действие. Попробуйте ещё раз.');
    }
}

let currentTopicIdForConcept = null;
let editingConceptId = null;

function openConceptModal(topicId, conceptId) {
    currentTopicIdForConcept = topicId;
    editingConceptId = conceptId || null;
    const topic = allTopics().find(t => t.id === topicId);
    const concept = editingConceptId ? topic?.concepts.find(c => c.id === editingConceptId) : null;
    document.getElementById('concept-modal-title').textContent = concept ? 'Редактировать понятие' : 'Новое понятие';
    document.getElementById('concept-submit-btn').textContent = concept ? 'Сохранить' : 'Добавить';
    document.getElementById('input-concept-name').value = concept ? concept.name : '';
    document.getElementById('input-concept-description').value = concept ? concept.description : '';
    document.getElementById('concept-overlay').classList.add('open');
    document.getElementById('input-concept-name').focus();
}

function closeConceptModal() {
    currentTopicIdForConcept = null;
    editingConceptId = null;
    document.getElementById('concept-overlay').classList.remove('open');
    document.getElementById('input-concept-name').value = '';
    document.getElementById('input-concept-description').value = '';
}

async function addConcept() {
    const name = document.getElementById('input-concept-name').value.trim();
    if (!name || !currentTopicIdForConcept) return;
    const description = document.getElementById('input-concept-description').value.trim();
    try {
        if (editingConceptId) {
            await api(`/concepts/${editingConceptId}`, {method: 'PATCH', body: JSON.stringify({name, description})});
        } else {
            await api(`/topics/${currentTopicIdForConcept}/concepts`, {
                method: 'POST',
                body: JSON.stringify({name, description}),
            });
        }
        await refreshKnowledge();
        closeConceptModal();
    } catch (err) {
        console.error(err);
        showToast('Не удалось выполнить действие. Попробуйте ещё раз.');
    }
}

async function deleteConcept(conceptId) {
    try {
        await api(`/concepts/${conceptId}`, {method: 'DELETE'});
        await refreshKnowledge();
    } catch (err) {
        console.error(err);
        showToast('Не удалось выполнить действие. Попробуйте ещё раз.');
    }
}

let editingBlockId = null;

function openBlockModal(blockId) {
    editingBlockId = blockId || null;
    const block = editingBlockId ? knowledgeBlocks.find(b => b.id === editingBlockId) : null;
    document.getElementById('block-modal-title').textContent = block ? 'Переименовать блок' : 'Новый блок';
    document.getElementById('block-submit-btn').textContent = block ? 'Сохранить' : 'Добавить';
    document.getElementById('input-block-name').value = block ? block.name : '';
    document.getElementById('block-overlay').classList.add('open');
    document.getElementById('input-block-name').focus();
}

function closeBlockModal() {
    editingBlockId = null;
    document.getElementById('block-overlay').classList.remove('open');
    document.getElementById('input-block-name').value = '';
}

async function addBlock() {
    const name = document.getElementById('input-block-name').value.trim();
    if (!name) return;
    try {
        if (editingBlockId) {
            await api(`/blocks/${editingBlockId}`, {method: 'PATCH', body: JSON.stringify({name})});
        } else {
            await api('/blocks', {method: 'POST', body: JSON.stringify({name})});
        }
        await refreshKnowledge();
        closeBlockModal();
    } catch (err) {
        console.error(err);
        showToast('Не удалось выполнить действие. Попробуйте ещё раз.');
    }
}

async function deleteBlock(blockId) {
    if (!confirm('Удалить блок? Темы внутри него останутся, но станут без блока.')) return;
    try {
        await api(`/blocks/${blockId}`, {method: 'DELETE'});
        await refreshKnowledge();
    } catch (err) {
        console.error(err);
        showToast('Не удалось выполнить действие. Попробуйте ещё раз.');
    }
}

let draggedBlockId = null;
let draggedTopicId = null;
let draggedConceptId = null;

function onBlockDragStart(e) {
    e.stopPropagation();
    draggedBlockId = e.currentTarget.closest('.block-section').dataset.blockId;
    e.currentTarget.closest('.block-section').classList.add('dragging-block');
    e.dataTransfer.effectAllowed = 'move';
}

function onBlockDragEnd(e) {
    e.currentTarget.closest('.block-section').classList.remove('dragging-block');
    draggedBlockId = null;
}

function onBlockSectionDragOver(e) {
    if (!draggedBlockId && !draggedTopicId) return;
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
}

function onBlockSectionDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

async function onBlockSectionDrop(e) {
    if (!draggedBlockId && !draggedTopicId) return;
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const targetBlockId = e.currentTarget.dataset.blockId || null;

    if (draggedBlockId) {
        if (!targetBlockId || draggedBlockId === targetBlockId) return;
        const fromIdx = knowledgeBlocks.findIndex(b => b.id === draggedBlockId);
        const toIdx = knowledgeBlocks.findIndex(b => b.id === targetBlockId);
        const [moved] = knowledgeBlocks.splice(fromIdx, 1);
        knowledgeBlocks.splice(toIdx, 0, moved);
        renderKnowledge();
        try {
            await api('/blocks/reorder', {method: 'PUT', body: JSON.stringify({keys: knowledgeBlocks.map(b => b.id)})});
        } catch (err) {
            console.error(err);
            showToast('Не удалось выполнить действие. Попробуйте ещё раз.');
            await refreshKnowledge();
        }
        return;
    }

    if (draggedTopicId) {
        const topic = allTopics().find(t => t.id === draggedTopicId);
        if (topic && topic.block_id !== targetBlockId) {
            try {
                await api(`/topics/${draggedTopicId}`, {method: 'PATCH', body: JSON.stringify({block_id: targetBlockId})});
                await refreshKnowledge();
            } catch (err) {
                console.error(err);
                showToast('Не удалось выполнить действие. Попробуйте ещё раз.');
            }
        }
    }
}

function onTopicDragStart(e) {
    e.stopPropagation();
    draggedTopicId = e.currentTarget.dataset.topicId;
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function onTopicDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    draggedTopicId = null;
}

function topicsInBlock(blockId) {
    if (blockId === null) return ungroupedTopics;
    const block = knowledgeBlocks.find(b => b.id === blockId);
    return block ? block.topics : [];
}

function onTopicDragOver(e) {
    if (draggedConceptId) {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.classList.add('drag-over');
        return;
    }
    if (draggedTopicId && draggedTopicId !== e.currentTarget.dataset.topicId) {
        e.preventDefault();
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        const before = (e.clientX - rect.left) < rect.width / 2;
        e.currentTarget.classList.toggle('drop-before', before);
        e.currentTarget.classList.toggle('drop-after', !before);
    }
}

function onTopicDragLeave(e) {
    e.currentTarget.classList.remove('drag-over', 'drop-before', 'drop-after');
}

async function onTopicDrop(e) {
    if (draggedConceptId) {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.classList.remove('drag-over');
        const targetTopicId = e.currentTarget.dataset.topicId;

        const topic = allTopics().find(t => t.concepts.some(c => c.id === draggedConceptId));
        if (topic && topic.id !== targetTopicId) {
            try {
                await api(`/concepts/${draggedConceptId}`, {method: 'PATCH', body: JSON.stringify({topic_id: targetTopicId})});
                await refreshKnowledge();
            } catch (err) {
                console.error(err);
                showToast('Не удалось выполнить действие. Попробуйте ещё раз.');
            }
        }
        return;
    }

    if (draggedTopicId && draggedTopicId !== e.currentTarget.dataset.topicId) {
        e.preventDefault();
        e.stopPropagation();
        const before = e.currentTarget.classList.contains('drop-before');
        e.currentTarget.classList.remove('drag-over', 'drop-before', 'drop-after');
        const targetTopic = allTopics().find(t => t.id === e.currentTarget.dataset.topicId);
        if (!targetTopic) return;
        const siblings = topicsInBlock(targetTopic.block_id).filter(t => t.id !== draggedTopicId);
        const targetIndex = siblings.findIndex(t => t.id === targetTopic.id);
        const position = before ? targetIndex : targetIndex + 1;
        try {
            await api(`/topics/${draggedTopicId}`, {
                method: 'PATCH',
                body: JSON.stringify({block_id: targetTopic.block_id, position}),
            });
            await refreshKnowledge();
        } catch (err) {
            console.error(err);
            showToast('Не удалось выполнить действие. Попробуйте ещё раз.');
        }
    }
}

function onConceptDragStart(e) {
    e.stopPropagation();
    draggedConceptId = e.currentTarget.dataset.conceptId;
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function onConceptDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    draggedConceptId = null;
}

function onConceptRowDragOver(e) {
    if (!draggedConceptId || draggedConceptId === e.currentTarget.dataset.conceptId) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const before = (e.clientY - rect.top) < rect.height / 2;
    e.currentTarget.classList.toggle('drop-before', before);
    e.currentTarget.classList.toggle('drop-after', !before);
}

function onConceptRowDragLeave(e) {
    e.currentTarget.classList.remove('drop-before', 'drop-after');
}

async function onConceptRowDrop(e) {
    if (!draggedConceptId || draggedConceptId === e.currentTarget.dataset.conceptId) return;
    e.preventDefault();
    e.stopPropagation();
    const before = e.currentTarget.classList.contains('drop-before');
    e.currentTarget.classList.remove('drop-before', 'drop-after');
    const targetConceptId = e.currentTarget.dataset.conceptId;
    const targetTopic = allTopics().find(t => t.concepts.some(c => c.id === targetConceptId));
    if (!targetTopic) return;
    const siblings = targetTopic.concepts.filter(c => c.id !== draggedConceptId);
    const targetIndex = siblings.findIndex(c => c.id === targetConceptId);
    const position = before ? targetIndex : targetIndex + 1;
    try {
        await api(`/concepts/${draggedConceptId}`, {
            method: 'PATCH',
            body: JSON.stringify({topic_id: targetTopic.id, position}),
        });
        await refreshKnowledge();
    } catch (err) {
        console.error(err);
        showToast('Не удалось выполнить действие. Попробуйте ещё раз.');
    }
}

document.getElementById('topic-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'topic-overlay') closeTopicModal();
});
document.getElementById('concept-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'concept-overlay') closeConceptModal();
});
document.getElementById('block-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'block-overlay') closeBlockModal();
});

const FINANCE_EMPTY_NOTE = 'Пока нет операций за период';
const FINANCE_CATEGORY_COLORS = ['#FF9E64', '#FFB454', '#7FA37B', '#5FA88E', '#E8A87C', '#D97B5F', '#B98F5F', '#8FB89A'];

const financeState = {
    kind: 'expense',
    currency: 'RUB',
    range: {from: null, to: null},
    categories: {expense: [], income: []},
    dashboard: null,
    categoryColors: {},
};

function financeCategoryColor(categoryId) {
    if (!financeState.categoryColors[categoryId]) {
        const used = Object.keys(financeState.categoryColors).length;
        financeState.categoryColors[categoryId] = FINANCE_CATEGORY_COLORS[used % FINANCE_CATEGORY_COLORS.length];
    }
    return financeState.categoryColors[categoryId];
}

function financeEmptyItem() {
    const li = document.createElement('li');
    li.className = 'finance-empty';
    li.textContent = FINANCE_EMPTY_NOTE;
    return li;
}

function formatRub(value) {
    return `${new Intl.NumberFormat('ru-RU').format(parseFloat(value))} ₽`;
}

function financeToday() {
    return new Date().toISOString().slice(0, 10);
}

function financePresetRange(preset) {
    const now = new Date();
    const to = financeToday();
    if (preset === '30d') {
        const from = new Date(now.getTime() - 29 * 86400000).toISOString().slice(0, 10);
        return {from, to};
    }
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    return {from, to};
}

function setFinanceRangePreset(preset) {
    document.getElementById('finance-custom-range').classList.add('hidden');
    document.querySelectorAll('#finance-range-control .range-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.range === preset);
    });
    financeState.range = financePresetRange(preset);
    refreshFinanceDashboard();
}

function showFinanceCustomRange() {
    document.querySelectorAll('#finance-range-control .range-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.range === 'custom');
    });
    document.getElementById('finance-range-from').value = financeState.range.from || financeToday();
    document.getElementById('finance-range-to').value = financeState.range.to || financeToday();
    document.getElementById('finance-custom-range').classList.remove('hidden');
}

function applyFinanceCustomRange() {
    const from = document.getElementById('finance-range-from').value;
    const to = document.getElementById('finance-range-to').value;
    if (!from || !to) return;
    financeState.range = {from, to};
    refreshFinanceDashboard();
}

function setFinanceKind(kind) {
    financeState.kind = kind;
    renderFinanceCategoryOptions();
}

function setFinanceCurrency(currency) {
    financeState.currency = currency;
}

function onFinanceCategorySelectChange() {
    const select = document.getElementById('finance-op-category');
    const isNew = select.value === '__new__';
    document.getElementById('finance-new-category-field').classList.toggle('hidden', !isNew);
    document.getElementById('finance-new-category-name').required = isNew;
}

function handleFinanceSubmit(event) {
    event.preventDefault();
    submitFinanceOperation();
    return false;
}

function renderFinanceCategoryOptions() {
    const select = document.getElementById('finance-op-category');
    const categories = financeState.categories[financeState.kind];
    select.innerHTML = categories.map((c) => `<option value="${escapeAttr(c.id)}">${escapeHtml(c.name)}</option>`).join('')
        + '<option value="__new__">+ новая категория</option>';
    onFinanceCategorySelectChange();
}

async function loadFinanceCategories() {
    const [expense, income] = await Promise.all([
        api('/finance/expense-categories'),
        api('/finance/income-categories'),
    ]);
    financeState.categories.expense = expense;
    financeState.categories.income = income;
    renderFinanceCategoryOptions();
}

async function submitFinanceOperation() {
    const amount = document.getElementById('finance-op-amount').value;
    const date = document.getElementById('finance-op-date').value;
    const select = document.getElementById('finance-op-category');
    if (!amount || !date) return;

    try {
        let categoryId = select.value;
        if (categoryId === '__new__') {
            const name = document.getElementById('finance-new-category-name').value.trim();
            if (!name) return;
            const path = financeState.kind === 'expense' ? '/finance/expense-categories' : '/finance/income-categories';
            const category = await api(path, {method: 'POST', body: JSON.stringify({name})});
            categoryId = category.id;
        }

        const endpoint = financeState.kind === 'expense' ? '/finance/expenses' : '/finance/incomes';
        await api(endpoint, {
            method: 'POST',
            body: JSON.stringify({category_id: categoryId, amount: Number(amount), currency: financeState.currency, date}),
        });

        document.getElementById('finance-op-amount').value = '';
        document.getElementById('finance-new-category-name').value = '';
        showToast('Операция добавлена', 'success');
        await loadFinanceCategories();
        select.value = categoryId;
        onFinanceCategorySelectChange();
        await refreshFinanceDashboard();
    } catch (err) {
        console.error(err);
        showToast('Не удалось выполнить действие. Попробуйте ещё раз.');
    }
}

function findFinanceCategoryName(categoryId) {
    const dashboard = financeState.dashboard;
    if (!dashboard) return '';
    const row = [...dashboard.expense_by_category, ...dashboard.income_by_category].find((r) => r.category_id === categoryId);
    return row ? row.category_name : '';
}

async function renameFinanceCategory(categoryId) {
    const currentName = findFinanceCategoryName(categoryId);
    const name = prompt('Новое название категории', currentName);
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === currentName) return;

    try {
        await api(`/finance/categories/${categoryId}`, {method: 'PATCH', body: JSON.stringify({name: trimmed})});
        showToast('Категория переименована', 'success');
        await loadFinanceCategories();
        await refreshFinanceDashboard();
    } catch (err) {
        console.error(err);
        showToast('Не удалось выполнить действие. Попробуйте ещё раз.');
    }
}

async function deleteFinanceCategory(categoryId) {
    const name = findFinanceCategoryName(categoryId);
    if (!confirm(`Удалить категорию «${name}»? Все операции этой категории тоже будут удалены.`)) return;

    try {
        await api(`/finance/categories/${categoryId}`, {method: 'DELETE'});
        showToast('Категория удалена', 'success');
        await loadFinanceCategories();
        await refreshFinanceDashboard();
    } catch (err) {
        console.error(err);
        showToast('Не удалось выполнить действие. Попробуйте ещё раз.');
    }
}

function financeCategoryRowHtml(row, total) {
    const color = financeCategoryColor(row.category_id);
    const pct = total > 0 ? Math.round((parseFloat(row.amount_rub) / total) * 100) : 0;
    return `
        <li style="--cat-color:${color}">
            <span class="finance-cat-name-wrap">
                <span class="finance-cat-name">${escapeHtml(row.category_name)}</span>
                <button class="finance-cat-edit" type="button" title="Переименовать" onclick="renameFinanceCategory('${row.category_id}')">${editIcon(11)}</button>
                <button class="finance-cat-edit" type="button" title="Удалить" onclick="deleteFinanceCategory('${row.category_id}')">${trashIcon(11)}</button>
            </span>
            <span class="finance-cat-right"><span class="finance-cat-pct">${pct}%</span>${formatRub(row.amount_rub)}</span>
            <div class="finance-cat-track"><div class="finance-cat-fill" style="width:${pct}%"></div></div>
        </li>`;
}

function renderFinanceCategoryList(elementId, breakdown, total) {
    const list = document.getElementById(elementId);
    if (breakdown.length === 0) {
        list.replaceChildren(financeEmptyItem());
        return;
    }
    list.innerHTML = breakdown.map((row) => financeCategoryRowHtml(row, total)).join('');
}

function renderFinanceRecentOperations(operations) {
    const list = document.getElementById('finance-recent-operations');
    if (operations.length === 0) {
        list.replaceChildren(financeEmptyItem());
        return;
    }
    list.innerHTML = operations.map((op) => {
        const sign = op.kind === 'expense' ? '−' : '+';
        const amtClass = op.kind === 'expense' ? 'neg' : 'pos';
        const meta = op.currency === 'BYN' ? ` · ${op.amount} BYN` : '';
        return `
            <li>
                <span>${escapeHtml(op.category_name)}<span class="finance-recent-meta">${op.date}${meta}</span></span>
                <span class="finance-amt ${amtClass}">${sign}${formatRub(op.amount_rub)}</span>
            </li>`;
    }).join('');
}

function renderFinanceSparkline(series) {
    const svg = document.getElementById('finance-spark');
    const emptyNote = document.getElementById('finance-spark-empty');

    if (series.length < 2) {
        svg.replaceChildren();
        svg.classList.add('hidden');
        emptyNote.classList.remove('hidden');
        emptyNote.textContent = series.length === 1
            ? `Баланс на ${series[0].date}: ${formatRub(series[0].cumulative_rub)}`
            : FINANCE_EMPTY_NOTE;
        return;
    }

    svg.classList.remove('hidden');
    emptyNote.classList.add('hidden');
    const values = series.map((p) => parseFloat(p.cumulative_rub));
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0);
    const range = max - min || 1;
    const width = 260;
    const height = 84;
    const points = series.map((p, i) => {
        const x = (i / (series.length - 1)) * width;
        const y = height - ((parseFloat(p.cumulative_rub) - min) / range) * height;
        return [x, y];
    });

    const ns = 'http://www.w3.org/2000/svg';
    const polyline = document.createElementNS(ns, 'polyline');
    polyline.setAttribute('points', points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '));
    polyline.setAttribute('stroke', '#FF9E64');
    polyline.setAttribute('stroke-width', '2');
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke-linejoin', 'round');
    polyline.setAttribute('stroke-linecap', 'round');

    const [lastX, lastY] = points[points.length - 1];
    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', lastX.toFixed(1));
    circle.setAttribute('cy', lastY.toFixed(1));
    circle.setAttribute('r', '3');
    circle.setAttribute('fill', '#FF9E64');

    svg.replaceChildren(polyline, circle);
}

function renderFinanceDashboard(data) {
    financeState.dashboard = data;
    document.getElementById('finance-income-total').textContent = formatRub(data.income_total_rub);
    document.getElementById('finance-expense-total').textContent = formatRub(data.expense_total_rub);
    document.getElementById('finance-balance-total').textContent = formatRub(data.balance_rub);

    renderFinanceCategoryList('finance-expense-categories', data.expense_by_category, parseFloat(data.expense_total_rub));
    renderFinanceCategoryList('finance-income-categories', data.income_by_category, parseFloat(data.income_total_rub));
    renderFinanceRecentOperations(data.recent_operations);
    renderFinanceSparkline(data.balance_series);
}

async function refreshFinanceDashboard() {
    const sections = document.getElementById('finance-dashboard-sections');
    sections.classList.add('finance-loading');
    try {
        const {from, to} = financeState.range;
        const data = await api(`/finance/dashboard?date_from=${from}&date_to=${to}`);
        renderFinanceDashboard(data);
    } catch (err) {
        console.error(err);
        showToast('Не удалось загрузить данные. Попробуйте ещё раз.');
    } finally {
        sections.classList.remove('finance-loading');
    }
}

async function initFinanceView() {
    document.getElementById('subtitle').textContent = '';
    if (!financeState.range.from) {
        financeState.range = financePresetRange('month');
        document.getElementById('finance-op-date').value = financeToday();
    }
    await loadFinanceCategories();
    await refreshFinanceDashboard();
}

async function handleRoute() {
    const taskMatch = location.hash.match(/^#\/task\/(.+)$/);
    const isKnowledge = location.hash === '#/knowledge';
    const isFinance = location.hash === '#/finance';
    const appHeader = document.getElementById('app-header');
    const boardView = document.getElementById('board-view');
    const detailView = document.getElementById('detail-view');
    const knowledgeView = document.getElementById('knowledge-view');
    const financeView = document.getElementById('finance-view');
    const alignControl = document.getElementById('align-control');

    appHeader.classList.remove('hidden');
    boardView.classList.add('hidden');
    detailView.classList.add('hidden');
    knowledgeView.classList.add('hidden');
    financeView.classList.add('hidden');
    alignControl.classList.toggle('hidden', isFinance);

    document.getElementById('tab-board').classList.toggle('active', !isKnowledge && !isFinance);
    document.getElementById('tab-knowledge').classList.toggle('active', isKnowledge);
    document.getElementById('tab-finance').classList.toggle('active', isFinance);

    if (taskMatch) {
        appHeader.classList.add('hidden');
        detailView.classList.remove('hidden');
        renderDetail(taskMatch[1]);
    } else if (isKnowledge) {
        knowledgeView.classList.remove('hidden');
        await refreshKnowledge();
    } else if (isFinance) {
        financeView.classList.remove('hidden');
        await initFinanceView();
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
