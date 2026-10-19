/* T2Smart-PicHancer — M4 i18n: chrome-string table (12 locales) + t()/setLang().
   Slider labels stay English (universal photo terms); look names stay as-is. */
(function () {
  "use strict";
  const EN = {
    looks: "Looks", light: "Light", color: "Color", fx: "FX", detail: "Detail",
    curves: "Curves", layers: "Layers", lens: "Lens", portrait: "Portrait",
    collage: "Collage", video: "Video", genfill: "Gen Fill", crop: "Crop",
    heal: "Heal", text: "Text", enhance: "Enhance", undo: "Undo", redo: "Redo", reset: "Reset",
    newphoto: "New photo", before: "Hold: Before", export: "Export",
    dropHint: "Drop a photo here or click to browse", upload: "Upload photo",
    demo: "Use demo photo", format: "Format", quality: "Quality", size: "Size",
    download: "Download", cancel: "Cancel", share: "Share", saveGallery: "Save to gallery", resume: "Resume last project?",
    dismiss: "Dismiss", addPhoto: "Add photo", play: "Play", pause: "Pause", generate: "Generate"
  };
  const LOCALES = {
    en: EN,
    es: { looks: "Filtros", light: "Luz", color: "Color", fx: "Efectos", detail: "Detalle", curves: "Curvas", layers: "Capas", lens: "Objetivo", portrait: "Retrato", collage: "Collage", video: "Vídeo", genfill: "Relleno IA", crop: "Recorte", heal: "Corrector", text: "Texto", undo: "Deshacer", redo: "Rehacer", reset: "Restablecer", newphoto: "Nueva foto", before: "Antes", export: "Exportar", dropHint: "Suelta una foto o haz clic", upload: "Subir foto", demo: "Foto de prueba", format: "Formato", quality: "Calidad", size: "Tamaño", download: "Descargar", cancel: "Cancelar", share: "Compartir", resume: "¿Retomar proyecto?", dismiss: "Cerrar", addPhoto: "Añadir foto", play: "Reproducir", pause: "Pausa", generate: "Generar" },
    fr: { looks: "Filtres", light: "Lumière", color: "Couleur", fx: "Effets", detail: "Détail", curves: "Courbes", layers: "Calques", lens: "Objectif", portrait: "Portrait", collage: "Collage", video: "Vidéo", genfill: "Remplissage IA", crop: "Recadrage", heal: "Correcteur", text: "Texte", undo: "Annuler", redo: "Rétablir", reset: "Réinitialiser", newphoto: "Nouvelle photo", before: "Avant", export: "Exporter", dropHint: "Déposez une photo ou cliquez", upload: "Importer", demo: "Photo démo", format: "Format", quality: "Qualité", size: "Taille", download: "Télécharger", cancel: "Annuler", share: "Partager", resume: "Reprendre le projet ?", dismiss: "Fermer", addPhoto: "Ajouter", play: "Lecture", pause: "Pause", generate: "Générer" },
    de: { looks: "Looks", light: "Licht", color: "Farbe", fx: "Effekte", detail: "Details", curves: "Kurven", layers: "Ebenen", lens: "Objektiv", portrait: "Porträt", collage: "Collage", video: "Video", genfill: "KI-Füllung", crop: "Zuschnitt", heal: "Reparatur", text: "Text", undo: "Rückgängig", redo: "Wiederholen", reset: "Zurücksetzen", newphoto: "Neues Foto", before: "Vorher", export: "Exportieren", dropHint: "Foto hierher ziehen oder klicken", upload: "Foto laden", demo: "Demofoto", format: "Format", quality: "Qualität", size: "Größe", download: "Herunterladen", cancel: "Abbrechen", share: "Teilen", resume: "Projekt fortsetzen?", dismiss: "Schließen", addPhoto: "Foto hinzu", play: "Abspielen", pause: "Pause", generate: "Erzeugen" },
    pt: { looks: "Filtros", light: "Luz", color: "Cor", fx: "Efeitos", detail: "Detalhe", curves: "Curvas", layers: "Camadas", lens: "Lente", portrait: "Retrato", collage: "Colagem", video: "Vídeo", genfill: "Preench. IA", crop: "Corte", heal: "Corretivo", text: "Texto", undo: "Desfazer", redo: "Refazer", reset: "Redefinir", newphoto: "Nova foto", before: "Antes", export: "Exportar", dropHint: "Solte uma foto ou clique", upload: "Enviar foto", demo: "Foto demo", format: "Formato", quality: "Qualidade", size: "Tamanho", download: "Baixar", cancel: "Cancelar", share: "Compartilhar", resume: "Retomar projeto?", dismiss: "Fechar", addPhoto: "Add foto", play: "Reproduzir", pause: "Pausa", generate: "Gerar" },
    it: { looks: "Filtri", light: "Luce", color: "Colore", fx: "Effetti", detail: "Dettagli", curves: "Curve", layers: "Livelli", lens: "Obiettivo", portrait: "Ritratto", collage: "Collage", video: "Video", genfill: "Riemp. IA", crop: "Ritaglio", heal: "Correttore", text: "Testo", undo: "Annulla", redo: "Ripeti", reset: "Azzera", newphoto: "Nuova foto", before: "Prima", export: "Esporta", dropHint: "Trascina una foto o fai clic", upload: "Carica foto", demo: "Foto demo", format: "Formato", quality: "Qualità", size: "Dimensione", download: "Scarica", cancel: "Annulla", share: "Condividi", resume: "Riprendere progetto?", dismiss: "Chiudi", addPhoto: "Aggiungi", play: "Riproduci", pause: "Pausa", generate: "Genera" },
    ru: { looks: "Фильтры", light: "Свет", color: "Цвет", fx: "Эффекты", detail: "Детали", curves: "Кривые", layers: "Слои", lens: "Объектив", portrait: "Портрет", collage: "Коллаж", video: "Видео", genfill: "Нейро-заливка", crop: "Кадрирование", heal: "Штамп", text: "Текст", undo: "Отменить", redo: "Вернуть", reset: "Сбросить", newphoto: "Новое фото", before: "До", export: "Экспорт", dropHint: "Перетащите фото или нажмите", upload: "Загрузить", demo: "Демо-фото", format: "Формат", quality: "Качество", size: "Размер", download: "Скачать", cancel: "Отмена", share: "Поделиться", resume: "Продолжить проект?", dismiss: "Закрыть", addPhoto: "Добавить", play: "Старт", pause: "Пауза", generate: "Создать" },
    zh: { looks: "滤镜", light: "光线", color: "颜色", fx: "特效", detail: "细节", curves: "曲线", layers: "图层", lens: "镜头", portrait: "人像", collage: "拼图", video: "视频", genfill: "AI填充", crop: "裁剪", heal: "修复", text: "文字", undo: "撤销", redo: "重做", reset: "重置", newphoto: "新照片", before: "对比原图", export: "导出", dropHint: "拖放照片到此处或点击浏览", upload: "上传照片", demo: "示例照片", format: "格式", quality: "质量", size: "尺寸", download: "下载", cancel: "取消", share: "分享", resume: "继续上次编辑?", dismiss: "关闭", addPhoto: "添加照片", play: "播放", pause: "暂停", generate: "生成" },
    ja: { looks: "フィルター", light: "ライト", color: "カラー", fx: "エフェクト", detail: "ディテール", curves: "カーブ", layers: "レイヤー", lens: "レンズ", portrait: "ポートレート", collage: "コラージュ", video: "ビデオ", genfill: "AI塗りつぶし", crop: "切り抜き", heal: "修復", text: "テキスト", undo: "元に戻す", redo: "やり直し", reset: "リセット", newphoto: "新しい写真", before: "長押しで比較", export: "書き出し", dropHint: "写真をドロップまたはクリック", upload: "アップロード", demo: "デモ写真", format: "形式", quality: "画質", size: "サイズ", download: "ダウンロード", cancel: "キャンセル", share: "共有", resume: "前回を再開?", dismiss: "閉じる", addPhoto: "写真を追加", play: "再生", pause: "一時停止", generate: "生成" },
    hi: { looks: "फ़िल्टर", light: "लाइट", color: "रंग", fx: "इफ़ेक्ट", detail: "विवरण", curves: "कर्व", layers: "लेयर", lens: "लेंस", portrait: "पोर्ट्रेट", collage: "कोलाज", video: "वीडियो", genfill: "AI भराव", crop: "क्रॉप", heal: "हील", text: "टेक्स्ट", undo: "पूर्ववत", redo: "फिर से", reset: "रीसेट", newphoto: "नई फ़ोटो", before: "पहले देखें", export: "निर्यात", dropHint: "फ़ोटो यहाँ छोड़ें या क्लिक करें", upload: "फ़ोटो अपलोड", demo: "डेमो फ़ोटो", format: "प्रारूप", quality: "गुणवत्ता", size: "आकार", download: "डाउनलोड", cancel: "रद्द", share: "साझा", resume: "प्रोजेक्ट जारी रखें?", dismiss: "बंद करें", addPhoto: "फ़ोटो जोड़ें", play: "चलाएँ", pause: "रोकें", generate: "बनाएँ" },
    ar: { looks: "فلاتر", light: "إضاءة", color: "لون", fx: "مؤثرات", detail: "تفاصيل", curves: "منحنيات", layers: "طبقات", lens: "عدسة", portrait: "بورتريه", collage: "كولاج", video: "فيديو", genfill: "تعبئة ذكية", crop: "قص", heal: "معالج", text: "نص", undo: "تراجع", redo: "إعادة", reset: "إعادة ضبط", newphoto: "صورة جديدة", before: "قبل", export: "تصدير", dropHint: "أسقط صورة هنا أو انقر", upload: "رفع صورة", demo: "صورة تجريبية", format: "الصيغة", quality: "الجودة", size: "الحجم", download: "تنزيل", cancel: "إلغاء", share: "مشاركة", resume: "استئناف المشروع؟", dismiss: "إغلاق", addPhoto: "إضافة صورة", play: "تشغيل", pause: "إيقاف", generate: "توليد" },
    ko: { looks: "필터", light: "라이트", color: "컬러", fx: "효과", detail: "디테일", curves: "커브", layers: "레이어", lens: "렌즈", portrait: "인물", collage: "콜라주", video: "비디오", genfill: "AI 채우기", crop: "자르기", heal: "복원", text: "텍스트", undo: "실행 취소", redo: "다시 실행", reset: "초기화", newphoto: "새 사진", before: "원본 보기", export: "내보내기", dropHint: "사진을 드래그하거나 클릭", upload: "사진 업로드", demo: "데모 사진", format: "형식", quality: "품질", size: "크기", download: "다운로드", cancel: "취소", share: "공유", resume: "이전 작업 계속?", dismiss: "닫기", addPhoto: "사진 추가", play: "재생", pause: "일시정지", generate: "생성" }
  };

  let lang = "en";
  try { lang = localStorage.t2sLang || "en"; } catch (e) {}
  if (!LOCALES[lang]) lang = "en";

  function t(key) {
    const L = LOCALES[lang] || EN;
    return L[key] != null ? L[key] : (EN[key] != null ? EN[key] : key);
  }
  function setLang(code) {
    if (!LOCALES[code]) return;
    lang = code;
    try { localStorage.t2sLang = code; } catch (e) {}
    applyStatic();
  }
  function applyStatic() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
      el.placeholder = t(el.dataset.i18nPh);
    });
  }
  function getLang() { return lang; }
  function langList() { return Object.keys(LOCALES); }

  window.T2S_I18N = { t, setLang, getLang, langList, applyStatic };
})();
