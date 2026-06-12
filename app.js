// State Management
let project = {
    title: '',
    synopsis: '',
    chapters: []
};
let activeChapterId = null;
let saveTimeout = null;

// DOM Elements
const overviewScreen = document.getElementById('overview-screen');
const writingScreen = document.getElementById('writing-screen');
const themeToggle = document.getElementById('theme-toggle');
const sunIcon = document.querySelector('.sun-icon');
const moonIcon = document.querySelector('.moon-icon');
const exportProjectBtn = document.getElementById('export-project');
const importProjectTrigger = document.getElementById('import-project-trigger');
const importProjectFile = document.getElementById('import-project-file');

// Overview Elements
const projectTitleInput = document.getElementById('project-title');
const projectSynopsisTextarea = document.getElementById('project-synopsis');
const synopsisWordCount = document.getElementById('synopsis-word-count');
const addChapterBtn = document.getElementById('add-chapter-btn');
const chaptersList = document.getElementById('chapters-list');

// Editor Elements
const backToOverviewBtn = document.getElementById('back-to-overview');
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
    loadData();
    setupEventListeners();
    renderOverview();
});

// Load Theme from LocalStorage
function loadTheme() {
    const savedTheme = localStorage.getItem('monote-theme') || 'light-mode';
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

// Load Data from LocalStorage
function loadData() {
    const savedData = localStorage.getItem('monote-project');
    if (savedData) {
        try {
            project = JSON.parse(savedData);
        } catch (e) {
            console.error("Failed to parse project data:", e);
        }
    } else {
        // Default structure
        project = {
            title: '',
            synopsis: '',
            chapters: []
        };
    }
}

// Save Data to LocalStorage with Debounce
function triggerSave() {
    saveStatus.textContent = "저장 중...";
    saveStatus.style.opacity = "1";
    
    if (saveTimeout) clearTimeout(saveTimeout);
    
    saveTimeout = setTimeout(() => {
        localStorage.setItem('monote-project', JSON.stringify(project));
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
            localStorage.setItem('monote-theme', 'dark-mode');
            updateThemeIcons('dark-mode');
        } else {
            document.body.classList.replace('dark-mode', 'light-mode');
            localStorage.setItem('monote-theme', 'light-mode');
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

    deleteChapterBtn.addEventListener('click', () => {
        if (activeChapterId !== null) {
            if (confirm("이 챕터를 완전히 삭제하시겠습니까? 되돌릴 수 없습니다.")) {
                deleteChapter(activeChapterId);
            }
        }
    });

    // Project Backup & Restore Listeners
    exportProjectBtn.addEventListener('click', exportProject);
    importProjectTrigger.addEventListener('click', () => {
        importProjectFile.click();
    });
    importProjectFile.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            importProject(e.target.files[0]);
        }
    });
}

// Render Overview View
function renderOverview() {
    projectTitleInput.value = project.title || '';
    projectSynopsisTextarea.value = project.synopsis || '';
    updateSynopsisCount();
    renderChapterList();
}

// Update Synopsis Character Count
function updateSynopsisCount() {
    const len = project.synopsis ? project.synopsis.length : 0;
    synopsisWordCount.textContent = `${len.toLocaleString()}자`;
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
            prefix = `PART ${String(partCount).padStart(2, '0')}`;
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
            prefix = `PART ${String(partCount).padStart(2, '0')}`;
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
    setTimeout(() => {
        overviewScreen.style.display = 'none';
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
    setTimeout(() => {
        writingScreen.style.display = 'none';
        overviewScreen.style.display = 'block';
        setTimeout(() => {
            overviewScreen.classList.add('active');
        }, 50);
    }, 300);
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
