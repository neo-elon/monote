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
        card.className = 'chapter-card';
        card.dataset.id = chapter.id;
        
        // Calculate length details
        const charCount = chapter.content ? chapter.content.length : 0;
        const previewText = chapter.content ? chapter.content.substring(0, 150) : '비어 있는 챕터입니다. 내용을 작성해 주세요.';
        
        card.innerHTML = `
            <div class="card-header">
                <span class="chapter-num">CHAPTER ${String(index + 1).padStart(2, '0')}</span>
                <span class="char-counter">${charCount.toLocaleString()}자</span>
            </div>
            <h3 class="chapter-card-title">${chapter.title || '제목 없음'}</h3>
            <p class="chapter-preview">${previewText}</p>
            <div class="card-footer">
                <span>최근 편집됨</span>
                <span>공백 포함</span>
            </div>
        `;
        
        card.addEventListener('click', () => {
            openChapterEditor(chapter.id);
        });
        
        chaptersList.appendChild(card);
    });
}

// Add New Chapter
function addNewChapter() {
    const newId = Date.now().toString();
    const newChapter = {
        id: newId,
        title: '',
        content: ''
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
    const chIndex = project.chapters.indexOf(chapter) + 1;
    chapterNumberBadge.textContent = `CHAPTER ${String(chIndex).padStart(2, '0')}`;
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
