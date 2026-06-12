// Safe localStorage wrapper for environments where localStorage is restricted (e.g., in-app browsers, private modes)
const storage = {
    _data: {},
    getItem(key) {
        try {
            return window.localStorage.getItem(key);
        } catch (e) {
            console.warn(`localStorage.getItem failed for "${key}":`, e);
            return this._data[key] || null;
        }
    },
    setItem(key, value) {
        try {
            window.localStorage.setItem(key, value);
        } catch (e) {
            console.warn(`localStorage.setItem failed for "${key}":`, e);
            this._data[key] = String(value);
        }
    },
    removeItem(key) {
        try {
            window.localStorage.removeItem(key);
        } catch (e) {
            console.warn(`localStorage.removeItem failed for "${key}":`, e);
            delete this._data[key];
        }
    }
};

// State Management
let projects = [];
let activeProjectId = null;
let project = null; // Active project reference
let activeChapterId = null;
let saveTimeout = null;

// DOM Elements
const bookshelfScreen = document.getElementById('bookshelf-screen');
const overviewScreen = document.getElementById('overview-screen');
const writingScreen = document.getElementById('writing-screen');
const themeToggle = document.getElementById('theme-toggle');
const sunIcon = document.querySelector('.sun-icon');
const moonIcon = document.querySelector('.moon-icon');
const exportProjectBtn = document.getElementById('export-project');
const importProjectTrigger = document.getElementById('import-project-trigger');
const importProjectFile = document.getElementById('import-project-file');
const goToBookshelfBtn = document.getElementById('logo-area');

// Overview Elements
const projectTitleInput = document.getElementById('project-title');
const projectSynopsisTextarea = document.getElementById('project-synopsis');
const synopsisWordCount = document.getElementById('synopsis-word-count');
const projectIdeasTextarea = document.getElementById('project-ideas');
const ideasWordCount = document.getElementById('ideas-word-count');
const addChapterBtn = document.getElementById('add-chapter-btn');
const chaptersList = document.getElementById('chapters-list');

// Editor Elements
const backToOverviewBtn = document.getElementById('back-to-overview');
const spellCheckBtn = document.getElementById('spell-check-btn');
const exportChapterBtn = document.getElementById('export-chapter');
const deleteChapterBtn = document.getElementById('delete-chapter');
const chapterTitleInput = document.getElementById('chapter-title');
const chapterNumberBadge = document.getElementById('chapter-number-badge');
const chapterContentTextarea = document.getElementById('chapter-content');
const charCountWithSpaces = document.getElementById('char-count-with-spaces');
const charCountNoSpaces = document.getElementById('char-count-no-spaces');
const wordCountElement = document.getElementById('word-count');
const saveStatus = document.getElementById('save-status');

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    loadTheme();
    loadProjects();
    setupEventListeners();
    renderBookshelf();
});

// Load Theme from LocalStorage
function loadTheme() {
    const savedTheme = storage.getItem('monote-theme') || 'light-mode';
    document.body.className = savedTheme;
    updateThemeIcons(savedTheme);
}

// Update Theme Icons
function updateThemeIcons(theme) {
    if (theme === 'dark-mode') {
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'block';
    } else {
        sunIcon.style.display = 'block';
        moonIcon.style.display = 'none';
    }
}

// Load Projects and handle Migration
function loadProjects() {
    const savedProjects = storage.getItem('monote-projects');
    if (savedProjects) {
        try {
            projects = JSON.parse(savedProjects);
        } catch (e) {
            console.error("Failed to parse projects data:", e);
            projects = [];
        }
    } else {
        projects = [];
    }

    // Migration from old single-project structure
    const savedOldProject = storage.getItem('monote-project');
    if (savedOldProject) {
        try {
            const oldProject = JSON.parse(savedOldProject);
            if (oldProject && (oldProject.title || (oldProject.chapters && oldProject.chapters.length > 0))) {
                // Migrate to new structure
                const migrated = {
                    id: Date.now().toString(),
                    title: oldProject.title || '임시 작품',
                    synopsis: oldProject.synopsis || '',
                    ideas: oldProject.ideas || '',
                    chapters: oldProject.chapters || [],
                    coverColor: 'charcoal',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                projects.push(migrated);
                storage.setItem('monote-projects', JSON.stringify(projects));
            }
        } catch (e) {
            console.error("Failed to migrate old project:", e);
        }
        // Remove old key so we don't migrate again
        storage.removeItem('monote-project');
    }
}

// Save Data to LocalStorage with Debounce
function triggerSave() {
    if (!activeProjectId) return;
    
    saveStatus.textContent = "저장 중...";
    saveStatus.style.opacity = "1";
    
    if (saveTimeout) clearTimeout(saveTimeout);
    
    saveTimeout = setTimeout(() => {
        // Find index of current project
        const idx = projects.findIndex(p => p.id === activeProjectId);
        if (idx !== -1) {
            project.updatedAt = new Date().toISOString();
            projects[idx] = project;
            storage.setItem('monote-projects', JSON.stringify(projects));
        }
        saveStatus.textContent = "저장 완료";
        setTimeout(() => {
            saveStatus.style.opacity = "0.7";
        }, 1000);
    }, 500);
}

// Set up UI Event Listeners
function setupEventListeners() {
    // Theme Toggle
    themeToggle.addEventListener('click', () => {
        if (document.body.classList.contains('light-mode')) {
            document.body.classList.replace('light-mode', 'dark-mode');
            storage.setItem('monote-theme', 'dark-mode');
            updateThemeIcons('dark-mode');
        } else {
            document.body.classList.replace('dark-mode', 'light-mode');
            storage.setItem('monote-theme', 'light-mode');
            updateThemeIcons('light-mode');
        }
    });

    // Project Info Listeners
    projectTitleInput.addEventListener('input', (e) => {
        project.title = e.target.value;
        triggerSave();
    });

    projectSynopsisTextarea.addEventListener('input', (e) => {
        project.synopsis = e.target.value;
        updateSynopsisCount();
        triggerSave();
    });

    projectIdeasTextarea.addEventListener('input', (e) => {
        project.ideas = e.target.value;
        updateIdeasCount();
        triggerSave();
    });

    // Chapter Management Listeners
    addChapterBtn.addEventListener('click', addNewChapter);
    backToOverviewBtn.addEventListener('click', showOverviewScreen);
    
    // Editor Listeners
    chapterTitleInput.addEventListener('input', (e) => {
        if (activeChapterId !== null) {
            const ch = project.chapters.find(c => c.id === activeChapterId);
            if (ch) {
                ch.title = e.target.value;
                triggerSave();
            }
        }
    });

    chapterContentTextarea.addEventListener('input', (e) => {
        if (activeChapterId !== null) {
            const ch = project.chapters.find(c => c.id === activeChapterId);
            if (ch) {
                ch.content = e.target.value;
                updateEditorCounts(e.target.value);
                triggerSave();
            }
        }
    });

    exportChapterBtn.addEventListener('click', () => {
        if (activeChapterId !== null) {
            exportChapter(activeChapterId);
        }
    });

    spellCheckBtn.addEventListener('click', () => {
        if (activeChapterId !== null) {
            const ch = project.chapters.find(c => c.id === activeChapterId);
            if (ch) {
                runSpellCheck(ch.content || '');
            }
        }
    });

    deleteChapterBtn.addEventListener('click', () => {
        if (activeChapterId !== null) {
            if (confirm("이 챕터를 완전히 삭제하시겠습니까? 되돌릴 수 없습니다.")) {
                deleteChapter(activeChapterId);
            }
        }
    });

    // Project Backup & Restore Listeners
    exportProjectBtn.addEventListener('click', exportProject);
    document.getElementById('export-project-txt').addEventListener('click', exportProjectTxt);
    importProjectTrigger.addEventListener('click', () => {
        importProjectFile.click();
    });
    importProjectFile.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            importProject(e.target.files[0]);
        }
    });

    // Bookshelf Navigation & Event Listeners
    goToBookshelfBtn.addEventListener('click', showBookshelfScreen);
    
    document.getElementById('create-project-btn').addEventListener('click', showNewBookDialog);
    document.getElementById('cancel-new-book').addEventListener('click', hideNewBookDialog);
    document.getElementById('confirm-new-book').addEventListener('click', createNewProject);
    
    // Color picker active state toggle
    document.querySelectorAll('.cover-color-picker input[name="cover-color"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            document.querySelectorAll('.cover-color-picker .color-option').forEach(opt => {
                opt.classList.remove('active');
            });
            e.target.closest('.color-option').classList.add('active');
        });
    });
}

// Render Overview View
function renderOverview() {
    projectTitleInput.value = project.title || '';
    projectSynopsisTextarea.value = project.synopsis || '';
    projectIdeasTextarea.value = project.ideas || '';
    updateSynopsisCount();
    updateIdeasCount();
    renderChapterList();
}

// Update Synopsis Character Count
function updateSynopsisCount() {
    const len = project.synopsis ? project.synopsis.length : 0;
    synopsisWordCount.textContent = `${len.toLocaleString()}자`;
}

// Update Ideas Character Count
function updateIdeasCount() {
    const len = project.ideas ? project.ideas.length : 0;
    ideasWordCount.textContent = `${len.toLocaleString()}자`;
}

// Helper to get prefix dynamically for any chapter based on its level
function getChapterPrefix(chapterId) {
    let partCount = 0;
    let chapterCount = 0;
    let sceneCount = 0;
    
    for (let i = 0; i < (project.chapters || []).length; i++) {
        const ch = project.chapters[i];
        const lvl = ch.level || 0;
        
        let prefix = '';
        if (lvl === 0) {
            partCount++;
            chapterCount = 0; sceneCount = 0;
            prefix = `${partCount}`;
        } else if (lvl === 1) {
            chapterCount++;
            sceneCount = 0;
            prefix = `${Math.max(1, partCount)}.${chapterCount}`;
        } else if (lvl === 2) {
            sceneCount++;
            prefix = `${Math.max(1, partCount)}.${Math.max(1, chapterCount)}.${sceneCount}`;
        }
        
        if (ch.id === chapterId) {
            return prefix;
        }
    }
    return '';
}

// Render the Chapter List Cards
function renderChapterList() {
    chaptersList.innerHTML = '';
    
    if (!project.chapters || project.chapters.length === 0) {
        chaptersList.innerHTML = `
            <div class="empty-chapters">
                아직 생성된 챕터가 없습니다. 오른쪽 상단의 '+ 챕터 추가' 버튼을 눌러 첫 글을 시작해 보세요.
            </div>
        `;
        return;
    }

    project.chapters.forEach((chapter, index) => {
        const card = document.createElement('div');
        // Fallback for missing level
        if (chapter.level === undefined) {
            chapter.level = 0;
        }
        // Force clamp to max level 2 (3 steps: 0, 1, 2)
        if (chapter.level > 2) {
            chapter.level = 2;
        }
        
        card.className = `chapter-card level-${chapter.level}`;
        card.dataset.id = chapter.id;
        card.setAttribute('draggable', 'true');
        
        // Calculate length details
        const charCount = chapter.content ? chapter.content.length : 0;
        const prefix = getChapterPrefix(chapter.id);
        
        // Generate tree dotted guide lines
        let treeLinesHtml = '<div class="tree-lines">';
        for (let l = 1; l <= chapter.level; l++) {
            const isConnector = (l === chapter.level);
            
            // Check if there is another chapter of level >= l below
            let hasSiblingBelow = false;
            for (let j = index + 1; j < project.chapters.length; j++) {
                const nextCh = project.chapters[j];
                if (nextCh.level < l) {
                    break;
                }
                if (nextCh.level >= l) {
                    hasSiblingBelow = true;
                    break;
                }
            }
            
            if (isConnector) {
                const connClass = hasSiblingBelow ? 'tree-line-branch' : 'tree-line-corner';
                treeLinesHtml += `<div class="tree-line ${connClass}"></div>`;
            } else {
                let needLine = false;
                for (let j = index + 1; j < project.chapters.length; j++) {
                    const nextCh = project.chapters[j];
                    if (nextCh.level < l) {
                        break;
                    }
                    if (nextCh.level >= l) {
                        needLine = true;
                        break;
                    }
                }
                if (needLine) {
                    treeLinesHtml += `<div class="tree-line tree-line-vertical"></div>`;
                } else {
                    treeLinesHtml += `<div class="tree-line tree-line-empty"></div>`;
                }
            }
        }
        treeLinesHtml += '</div>';
        
        card.innerHTML = `
            <div class="tree-indent-wrapper">
                ${treeLinesHtml}
                <div class="tree-controls">
                    <button class="btn-tree-lvl outdent-btn" title="들여쓰기 축소">◀</button>
                    <button class="btn-tree-lvl indent-btn" title="들여쓰기 확대">▶</button>
                </div>
                <span class="chapter-num-badge">${prefix}</span>
                <span class="chapter-card-title">${chapter.title || '제목 없음'}</span>
            </div>
            <span class="char-counter">${charCount.toLocaleString()}자</span>
        `;
        
        let isDragging = false;
        let touchStartCard = null;
        let touchStartIndex = index;
        let dragStartX = 0;
        let dragStartLevel = chapter.level || 0;
        let lastTouchX = 0;

        // Click to open editor (only if not dragging)
        card.addEventListener('click', (e) => {
            if (isDragging) return;
            openChapterEditor(chapter.id);
        });

        // Outdent & Indent Button Event Listeners
        const outdentBtn = card.querySelector('.outdent-btn');
        const indentBtn = card.querySelector('.indent-btn');

        outdentBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent card click
            if (chapter.level > 0) {
                chapter.level--;
                triggerSave();
                renderChapterList();
            }
        });

        indentBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent card click
            if (chapter.level < 2) {
                chapter.level++;
                triggerSave();
                renderChapterList();
            }
        });

        // Drag & Drop event handlers (Mouse / Desktop)
        card.addEventListener('dragstart', (e) => {
            isDragging = true;
            dragStartX = e.clientX;
            dragStartLevel = chapter.level || 0;
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', chapter.id);
        });

        card.addEventListener('drag', (e) => {
            if (e.clientX === 0) return; // Ignore dragend boundary coordinate
            const deltaX = e.clientX - dragStartX;
            const levelShift = Math.round(deltaX / 24);
            const tempLevel = Math.max(0, Math.min(2, dragStartLevel + levelShift));
            
            // Instantly update UI class to show dynamic indent and numbering styling
            card.className = `chapter-card level-${tempLevel} dragging`;
            const tempPrefix = getChapterPrefixForLvl(chapter.id, tempLevel);
            const badge = card.querySelector('.chapter-num-badge');
            if (badge) badge.textContent = tempPrefix;
        });

        card.addEventListener('dragend', (e) => {
            card.classList.remove('dragging');
            
            // Save final level shift based on end coordinate
            if (e.clientX !== 0) {
                const deltaX = e.clientX - dragStartX;
                const levelShift = Math.round(deltaX / 24);
                chapter.level = Math.max(0, Math.min(2, dragStartLevel + levelShift));
            }
            
            saveAndRefreshOrder();
            
            setTimeout(() => {
                isDragging = false;
            }, 100);
        });

        card.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggingCard = document.querySelector('.dragging');
            if (!draggingCard || draggingCard === card) return;
            
            // Determine vertical position
            const rect = card.getBoundingClientRect();
            const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
            
            // Insert visual preview
            chaptersList.insertBefore(draggingCard, next ? card.nextSibling : card);
        });

        card.addEventListener('drop', (e) => {
            e.preventDefault();
        });

        let touchStartY = 0;
        let hasMovedThreshold = false;

        // Touch Drag & Drop event handlers (Mobile / Finger)
        card.addEventListener('touchstart', (e) => {
            touchStartCard = card;
            dragStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            lastTouchX = e.touches[0].clientX;
            dragStartLevel = chapter.level || 0;
            touchStartIndex = Array.from(chaptersList.children).indexOf(card);
            hasMovedThreshold = false;
            isDragging = false;
            // Clear text selection
            window.getSelection().removeAllRanges();
        }, { passive: true });

        card.addEventListener('touchmove', (e) => {
            if (!touchStartCard) return;
            
            const touch = e.touches[0];
            const currentY = touch.clientY;
            lastTouchX = touch.clientX;
            
            const deltaX = touch.clientX - dragStartX;
            const deltaY = touch.clientY - touchStartY;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            
            // Apply threshold (e.g. 6px) to distinguish drag from tap
            if (!hasMovedThreshold && distance > 6) {
                hasMovedThreshold = true;
                isDragging = true;
                card.classList.add('dragging');
            }
            
            if (isDragging) {
                // Prevent text selection highlight on move
                window.getSelection().removeAllRanges();
                
                // Horizontal shift calculation for live touch feedback
                const levelShift = Math.round(deltaX / 24);
                const tempLevel = Math.max(0, Math.min(2, dragStartLevel + levelShift));
                card.className = `chapter-card level-${tempLevel} dragging`;
                
                // Find element under current finger position
                const elementUnder = document.elementFromPoint(touch.clientX, touch.clientY);
                if (elementUnder) {
                    const targetCard = elementUnder.closest('.chapter-card');
                    if (targetCard && targetCard !== card) {
                        // Prevent standard screen scroll while reordering
                        if (e.cancelable) e.preventDefault();
                        
                        const rect = targetCard.getBoundingClientRect();
                        const next = (currentY - rect.top) / (rect.bottom - rect.top) > 0.5;
                        
                        chaptersList.insertBefore(card, next ? targetCard.nextSibling : targetCard);
                    }
                }
            }
        }, { passive: false });

        card.addEventListener('touchend', (e) => {
            if (!touchStartCard) return;
            
            card.classList.remove('dragging');
            touchStartCard = null;
            
            if (isDragging) {
                // Save final touch level shift
                const deltaX = lastTouchX - dragStartX;
                const levelShift = Math.round(deltaX / 24);
                chapter.level = Math.max(0, Math.min(2, dragStartLevel + levelShift));
                
                saveAndRefreshOrder();
                
                setTimeout(() => {
                    isDragging = false;
                }, 100);
            } else {
                // It was a simple tap, open the editor immediately
                openChapterEditor(chapter.id);
            }
        });
        
        chaptersList.appendChild(card);
    });
}

// Helper to save order and refresh
function saveAndRefreshOrder() {
    const newChaptersOrder = [];
    const renderedCards = chaptersList.querySelectorAll('.chapter-card');
    renderedCards.forEach(cardEl => {
        const id = cardEl.dataset.id;
        const ch = project.chapters.find(c => c.id === id);
        if (ch) {
            newChaptersOrder.push(ch);
        }
    });
    project.chapters = newChaptersOrder;
    triggerSave();
    renderChapterList();
}

// Temporary prefix helper for live drag preview
function getChapterPrefixForLvl(chapterId, tempLevel) {
    let partCount = 0;
    let chapterCount = 0;
    let sceneCount = 0;
    
    for (let i = 0; i < (project.chapters || []).length; i++) {
        const ch = project.chapters[i];
        const lvl = ch.id === chapterId ? tempLevel : (ch.level || 0);
        
        let prefix = '';
        if (lvl === 0) {
            partCount++;
            chapterCount = 0; sceneCount = 0;
            prefix = `${partCount}`;
        } else if (lvl === 1) {
            chapterCount++;
            sceneCount = 0;
            prefix = `${Math.max(1, partCount)}.${chapterCount}`;
        } else if (lvl === 2) {
            sceneCount++;
            prefix = `${Math.max(1, partCount)}.${Math.max(1, chapterCount)}.${sceneCount}`;
        }
        
        if (ch.id === chapterId) {
            return prefix;
        }
    }
    return '';
}

// Add New Chapter
function addNewChapter() {
    const newId = Date.now().toString();
    const newChapter = {
        id: newId,
        title: '',
        content: '',
        level: 0
    };
    
    if (!project.chapters) {
        project.chapters = [];
    }
    
    project.chapters.push(newChapter);
    triggerSave();
    
    // Instantly open editor for the newly created chapter
    openChapterEditor(newId);
}

// Open Chapter Editor
function openChapterEditor(chapterId) {
    const chapter = project.chapters.find(c => c.id === chapterId);
    if (!chapter) return;
    
    activeChapterId = chapterId;
    
    // Set UI Values
    chapterNumberBadge.textContent = getChapterPrefix(chapterId);
    chapterTitleInput.value = chapter.title || '';
    chapterContentTextarea.value = chapter.content || '';
    
    // Update Character & Word Counts
    updateEditorCounts(chapter.content || '');
    
    // Switch Screen View
    showWritingScreen();

    // Focus on the chapter title input so user can type immediately
    setTimeout(() => {
        chapterTitleInput.focus();
    }, 350);
}

// Update Editor Counts (With Space, No Space, Word Count)
function updateEditorCounts(text) {
    const lenWithSpaces = text.length;
    const lenNoSpaces = text.replace(/\s/g, '').length;
    
    // Calculate Word Count (using standard regex matching words/syllables)
    const trimmed = text.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    
    charCountWithSpaces.textContent = `${lenWithSpaces.toLocaleString()}자`;
    charCountNoSpaces.textContent = `${lenNoSpaces.toLocaleString()}자`;
    wordCountElement.textContent = words.toLocaleString();
}

// View Switches
function showWritingScreen() {
    // Move chapters-panel to editor sidebar
    const chaptersPanel = document.getElementById('chapters-panel');
    const editorSidebar = document.getElementById('editor-sidebar');
    if (chaptersPanel && editorSidebar) {
        editorSidebar.appendChild(chaptersPanel);
    }

    overviewScreen.classList.remove('active');
    bookshelfScreen.classList.remove('active');
    setTimeout(() => {
        overviewScreen.style.display = 'none';
        bookshelfScreen.style.display = 'none';
        writingScreen.style.display = 'block';
        setTimeout(() => {
            writingScreen.classList.add('active');
        }, 50);
    }, 300);
}

function showOverviewScreen() {
    // Move chapters-panel back to overview grid
    const chaptersPanel = document.getElementById('chapters-panel');
    const overviewGrid = document.querySelector('.overview-grid');
    if (chaptersPanel && overviewGrid) {
        overviewGrid.appendChild(chaptersPanel);
    }

    activeChapterId = null;
    renderOverview();
    
    writingScreen.classList.remove('active');
    bookshelfScreen.classList.remove('active');
    setTimeout(() => {
        writingScreen.style.display = 'none';
        bookshelfScreen.style.display = 'none';
        overviewScreen.style.display = 'block';
        setTimeout(() => {
            overviewScreen.classList.add('active');
        }, 50);
    }, 300);
}

function showBookshelfScreen() {
    activeProjectId = null;
    project = null;
    
    
    overviewScreen.classList.remove('active');
    writingScreen.classList.remove('active');
    setTimeout(() => {
        overviewScreen.style.display = 'none';
        writingScreen.style.display = 'none';
        bookshelfScreen.style.display = 'block';
        setTimeout(() => {
            bookshelfScreen.classList.add('active');
            renderBookshelf();
        }, 50);
    }, 300);
}

// Render the Bookshelf View
function renderBookshelf() {
    const booksGrid = document.getElementById('books-grid');
    if (!booksGrid) return;
    
    booksGrid.innerHTML = '';
    
    // Add new project card
    const addCard = document.createElement('div');
    addCard.className = 'book-card';
    addCard.innerHTML = `
        <div class="book-cover" style="background: var(--bg-secondary); border: 1.5px dashed var(--border-color); display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-secondary); box-shadow: none;">
            <div style="font-size: 2rem; font-weight: 300;">+</div>
            <div style="font-size: 0.8rem; margin-top: 0.5rem;">새 작품 쓰기</div>
        </div>
        <div class="book-card-title-under" style="color: var(--text-secondary);">새 작품 추가</div>
    `;
    addCard.addEventListener('click', () => {
        showNewBookDialog();
    });
    booksGrid.appendChild(addCard);
    
    projects.forEach((proj) => {
        const bookCard = document.createElement('div');
        bookCard.className = 'book-card';
        bookCard.dataset.id = proj.id;
        
        const coverColor = proj.coverColor || 'charcoal';
        
        bookCard.innerHTML = `
            <button class="delete-book-btn" title="작품 삭제">×</button>
            <div class="book-cover cover-${coverColor}">
                <div class="book-cover-title">${proj.title || '제목 없음'}</div>
                <div class="book-cover-author">Monote</div>
            </div>
            <div class="book-card-title-under">${proj.title || '제목 없음'}</div>
        `;
        
        // Open project on click
        bookCard.addEventListener('click', (e) => {
            // If click was on delete button, do not open
            if (e.target.classList.contains('delete-book-btn')) {
                e.stopPropagation();
                if (confirm(`"${proj.title || '제목 없음'}" 작품을 완전히 삭제하시겠습니까?\n작성한 원고가 모두 삭제되며 되돌릴 수 없습니다.`)) {
                    deleteProject(proj.id);
                }
                return;
            }
            openProject(proj.id);
        });
        
        booksGrid.appendChild(bookCard);
    });
}

// Dialog elements references helper
const newBookDialog = document.getElementById('new-book-dialog');
const newBookTitleInput = document.getElementById('new-book-title');

// Show dialog
function showNewBookDialog() {
    newBookTitleInput.value = '';
    
    // Reset color option active class
    document.querySelectorAll('.cover-color-picker .color-option').forEach(opt => {
        opt.classList.remove('active');
    });
    const charcoalOpt = document.querySelector('.cover-color-picker .color-option.charcoal');
    if (charcoalOpt) charcoalOpt.classList.add('active');
    
    const defaultRadio = document.querySelector('input[name="cover-color"][value="charcoal"]');
    if (defaultRadio) defaultRadio.checked = true;

    newBookDialog.style.display = 'flex';
    setTimeout(() => {
        newBookTitleInput.focus();
    }, 100);
}

// Hide dialog
function hideNewBookDialog() {
    newBookDialog.style.display = 'none';
}

// Create new project
function createNewProject() {
    const title = newBookTitleInput.value.trim();
    if (!title) {
        alert("작품 제목을 입력해 주세요.");
        newBookTitleInput.focus();
        return;
    }
    
    const selectedColorRadio = document.querySelector('input[name="cover-color"]:checked');
    const coverColor = selectedColorRadio ? selectedColorRadio.value : 'charcoal';
    
    const newProj = {
        id: Date.now().toString(),
        title: title,
        synopsis: '',
        ideas: '',
        chapters: [],
        coverColor: coverColor,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    projects.push(newProj);
    storage.setItem('monote-projects', JSON.stringify(projects));
    hideNewBookDialog();
    renderBookshelf();
    
    // Open immediately
    openProject(newProj.id);
}

// Open selected project
function openProject(projectId) {
    const proj = projects.find(p => p.id === projectId);
    if (!proj) return;
    
    activeProjectId = projectId;
    project = JSON.parse(JSON.stringify(proj)); // Deep copy to edit
    activeChapterId = null;
    
    
    
    // Render and switch to Overview
    renderOverview();
    showOverviewScreen();
}

// Delete project
function deleteProject(projectId) {
    projects = projects.filter(p => p.id !== projectId);
    storage.setItem('monote-projects', JSON.stringify(projects));
    
    if (activeProjectId === projectId) {
        activeProjectId = null;
        project = null;
        
        showBookshelfScreen();
    } else {
        renderBookshelf();
    }
}

// Export Chapter to text file
function exportChapter(chapterId) {
    const chapter = project.chapters.find(c => c.id === chapterId);
    if (!chapter) return;
    
    const fileContent = `${chapter.title || '제목 없음'}\n\n${chapter.content || ''}`;
    const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${chapter.title || 'untitled-chapter'}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Delete Chapter
function deleteChapter(chapterId) {
    project.chapters = project.chapters.filter(c => c.id !== chapterId);
    triggerSave();
    showOverviewScreen();
}

// Export entire project to JSON backup file
function exportProject() {
    const filename = `${project.title || 'monote-backup'}-${new Date().toISOString().slice(0,10)}.json`;
    const jsonStr = JSON.stringify(project, null, 4);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Export entire project to single TXT file (all chapters compiled)
function exportProjectTxt() {
    if (!project.chapters || project.chapters.length === 0) {
        alert("내보낼 챕터가 없습니다.");
        return;
    }
    
    let fullText = '';
    
    // Add Project Title & Synopsis at the top
    fullText += `${project.title || '제목 없음'}\n\n`;
    if (project.synopsis) {
        fullText += `시놉시스:\n${project.synopsis}\n\n`;
    }
    fullText += `\n`;
    
    // Iterate through chapters in order
    project.chapters.forEach((chapter) => {
        const prefix = getChapterPrefix(chapter.id);
        const titleText = chapter.title || '제목 없음';
        
        // Add chapter header without decorators
        fullText += `${prefix} ${titleText}\n\n`;
        fullText += `${chapter.content || ''}\n\n\n`;
    });
    
    const filename = `${project.title || 'untitled-story'}-${new Date().toISOString().slice(0,10)}.txt`;
    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Import project from JSON backup file
function importProject(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            if (importedData && typeof importedData === 'object' && ('title' in importedData || 'chapters' in importedData)) {
                if (confirm("백업 파일을 불러오시겠습니까? 불러오게 되면 현재 작성 중인 내용은 덮어써집니다.")) {
                    project = importedData;
                    triggerSave();
                    renderOverview();
                    alert("성공적으로 백업 데이터를 불러왔습니다.");
                }
            } else {
                alert("올바른 Monote 백업 파일(.json)이 아닙니다.");
            }
        } catch (err) {
            console.error("Failed to parse imported file:", err);
            alert("파일 읽기에 실패했습니다. 올바른 형식의 백업 파일인지 확인해 주세요.");
        }
        // Reset input file value
        importProjectFile.value = '';
    };
    reader.readAsText(file);
}

// Copy content to clipboard and open external spellchecker (Daum Grammar Checker)
function runSpellCheck(text) {
    if (!text.trim()) {
        alert("검사할 본문 내용이 없습니다.");
        return;
    }
    
    navigator.clipboard.writeText(text).then(() => {
        alert("본문 내용이 클립보드에 복사되었습니다!\n\n확인 버튼을 누르면 맞춤법 검사기 페이지로 이동합니다. 입력창에 붙여넣기(Ctrl + V)하여 검사해 보세요.");
        window.open('https://dic.daum.net/grammar_checker.do', '_blank');
    }).catch(err => {
        console.error("Failed to copy text: ", err);
        // Fallback if clipboard API fails
        alert("맞춤법 검사기 페이지로 이동합니다. 본문을 직접 복사(Ctrl + C)하여 검사기 창에 붙여넣기(Ctrl + V) 하세요.");
        window.open('https://dic.daum.net/grammar_checker.do', '_blank');
    });
}
