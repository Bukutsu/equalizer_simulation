(() => {
  const uploadForm = document.getElementById("upload-form");
  const audioFileInput = document.getElementById("audio-file");
  const applyButton = document.getElementById("apply-button");
  const statusMessage = document.getElementById("status-message");
  const originalAudio = document.getElementById("original-audio");
  const processedAudio = document.getElementById("processed-audio");
  const frequencyChart = document.getElementById("frequency-chart");
  const transferBox = document.getElementById("transfer-function");
  const languageSelect = document.getElementById("language-select");
  const themeToggle = document.getElementById("theme-toggle");
  const sliders = Array.from(document.querySelectorAll(".band-slider"));
  const filterRadios = Array.from(document.querySelectorAll('input[name="filterType"]'));

  const translations = {
    en: {
      title: "Equalizer Simulation",
      subtitle: "Upload an audio file, choose a filter topology, and preview the equalized results.",
      language_label: "Language",
      lang_en: "English",
      lang_th: "ไทย",
      toggle_dark: "Enable Dark Mode",
      toggle_light: "Disable Dark Mode",
      section_upload: "1. Upload Audio",
      section_eq: "2. Equalizer Settings",
      section_response: "3. Frequency Response",
      section_transfer: "4. Z-Transform Transfer Function",
      transfer_desc: "The expression below is rendered using H(z) with z\u207B\u00B9 powers.",
      transfer_default: "Upload and process audio to view H(z).",
      transfer_ready: 'Adjust the sliders and click "Apply Equalizer" to update H(z).',
      transfer_processing: "Computing the Z-domain transfer function...",
      transfer_error: "Unable to compute the transfer function.",
      section_preview: "5. Preview Audio",
      upload_button: "Upload",
      status_ready: "Select a file to get started.",
      status_uploading: "Uploading and decoding audio...",
      status_upload_success: "Audio uploaded successfully.",
      status_upload_failed: "Upload failed:",
      status_processing: "Processing equalizer...",
      status_processing_success: "Equalization complete.",
      status_processing_failed: "Processing failed:",
      filter_legend: "Filter Type",
      filter_iir: "IIR (biquad cascade)",
      filter_fir: "FIR (linear-phase convolution)",
      apply_button: "Apply Equalizer",
      original_audio: "Original",
      processed_audio: "Equalized",
      footer_note: "FIR/IIR branching mirrors the DSP flow from the design diagram.",
      axis_frequency: "Frequency (Hz)",
      axis_gain: "Gain (dB)",
    },
    th: {
      title: "จำลองอีควอไลเซอร์",
      subtitle: "อัปโหลดไฟล์เสียง เลือกชนิดฟิลเตอร์ และฟังผลลัพธ์หลังปรับอีควอไลเซอร์",
      language_label: "ภาษา",
      lang_en: "English",
      lang_th: "ไทย",
      toggle_dark: "เปิดโหมดมืด",
      toggle_light: "ปิดโหมดมืด",
      section_upload: "1. อัปโหลดไฟล์เสียง",
      section_eq: "2. ตั้งค่าอีควอไลเซอร์",
      section_response: "3. การตอบสนองความถี่",
      section_transfer: "4. ฟังก์ชันถ่ายโอนในโดเมน Z",
      transfer_desc: "สมการด้านล่างแสดง H(z) ในรูป z^-1",
      transfer_default: "อัปโหลดและประมวลผลเพื่อดู H(z)",
      transfer_ready: 'ปรับสไลด์แล้วกด "ประมวลผลอีควอไลเซอร์" เพื่ออัปเดต H(z)',
      transfer_processing: "กำลังคำนวณฟังก์ชันถ่ายโอนในโดเมน Z...",
      transfer_error: "ไม่สามารถคำนวณฟังก์ชันถ่ายโอน",
      section_preview: "5. ฟังตัวอย่างเสียง",
      upload_button: "อัปโหลด",
      status_ready: "เลือกไฟล์เพื่อเริ่มต้น",
      status_uploading: "กำลังอัปโหลดและถอดรหัสเสียง...",
      status_upload_success: "อัปโหลดเสียงเรียบร้อย",
      status_upload_failed: "อัปโหลดไม่สำเร็จ:",
      status_processing: "กำลังประมวลผลอีควอไลเซอร์...",
      status_processing_success: "ประมวลผลเสร็จแล้ว",
      status_processing_failed: "ประมวลผลไม่สำเร็จ:",
      filter_legend: "ชนิดฟิลเตอร์",
      filter_iir: "IIR (ชุดบิกวอด)",
      filter_fir: "FIR (คอนโวลูชันเฟสเชิงเส้น)",
      apply_button: "ประมวลผลอีควอไลเซอร์",
      original_audio: "ต้นฉบับ",
      processed_audio: "หลังปรับ",
      footer_note: "โครงสร้าง FIR/IIR สอดคล้องกับแผนภาพการออกแบบ",
      axis_frequency: "ความถี่ (Hz)",
      axis_gain: "อัตราขยาย (dB)",
    },
  };

  const chartData = [
    {
      x: [],
      y: [],
      mode: "lines",
      line: { color: "#4a90e2", width: 3 },
      hovertemplate: "Freq: %{x:.0f} Hz<br>Gain: %{y:.2f} dB<extra></extra>",
    },
  ];
  const plotlyConfig = { responsive: true, displayModeBar: false };

  let audioId = null;
  let chartInitialized = false;
  let currentLanguage = "en";
  let currentTheme = "light";

  let currentStatus = { key: "status_ready", detail: null, detailKey: null, raw: null, type: "info" };
  let currentTransferKey = "transfer_default";
  let lastTransferData = null;

  const getCSSVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  const t = (key) => {
    const langPack = translations[currentLanguage] ?? translations.en;
    return langPack[key] ?? translations.en[key] ?? key;
  };

  const formatGain = (value) => `${Number(value).toFixed(1)} dB`;

  const updateSliderLabels = () => {
    sliders.forEach((slider) => {
      const label = document.getElementById(`${slider.id}-label`);
      if (label) {
        label.textContent = formatGain(slider.value);
      }
    });
  };

  const renderStatus = () => {
    statusMessage.className = currentStatus.type;
    if (currentStatus.raw !== null) {
      statusMessage.textContent = currentStatus.raw;
    } else if (currentStatus.key) {
      const base = t(currentStatus.key);
      const detail =
        currentStatus.detailKey ? ` ${t(currentStatus.detailKey)}` :
        currentStatus.detail ? ` ${currentStatus.detail}` : "";
      statusMessage.textContent = `${base}${detail}`;
    } else {
      statusMessage.textContent = "";
    }
  };

  const setStatus = (input, type = "info") => {
    if (typeof input === "string") {
      currentStatus = { key: input, detail: null, detailKey: null, raw: null, type };
    } else if (input && typeof input === "object" && "raw" in input) {
      currentStatus = { key: null, detail: null, detailKey: null, raw: input.raw, type };
    } else if (input && typeof input === "object") {
      currentStatus = {
        key: input.key ?? null,
        detail: input.detail ?? null,
        detailKey: input.detailKey ?? null,
        raw: null,
        type,
      };
    } else {
      currentStatus = { key: null, detail: null, detailKey: null, raw: null, type };
    }
    renderStatus();
  };

  const renderTransferMessage = () => {
    if (currentTransferKey === "custom" && lastTransferData) {
      const { latex, text } = lastTransferData;
      transferBox.innerHTML = `
        <div class="tf-math">\\[${latex}\\]</div>
        <pre class="tf-text">${text}</pre>
      `;
      if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([transferBox]);
      }
    } else {
      transferBox.textContent = t(currentTransferKey);
    }
  };

  const setTransferMessage = (key, data = null) => {
    currentTransferKey = key;
    lastTransferData = key === "custom" ? data : null;
    renderTransferMessage();
  };

  const getPlotlyLayout = () => {
    const panelBg = getCSSVar("--panel-bg") || "#ffffff";
    const textColor = getCSSVar("--text-color") || "#232b38";
    const gridColor = getCSSVar("--grid-color") || "#dddddd";
    const zeroColor = getCSSVar("--zeroline-color") || "#999999";
    const axisColor = getCSSVar("--axis-color") || textColor;

    return {
      margin: { t: 20, r: 20, b: 60, l: 70 },
      paper_bgcolor: panelBg,
      plot_bgcolor: panelBg,
      font: { color: textColor },
      xaxis: {
        title: t("axis_frequency"),
        type: "log",
        range: [Math.log10(20), Math.log10(20000)],
        dtick: Math.log10(10),
        gridcolor: gridColor,
        zeroline: true,
        zerolinecolor: zeroColor,
        color: axisColor,
      },
      yaxis: {
        title: t("axis_gain"),
        range: [-18, 18],
        gridcolor: gridColor,
        zeroline: true,
        zerolinecolor: zeroColor,
        color: axisColor,
      },
    };
  };

  const refreshChart = () => {
    if (!chartInitialized) return;
    chartData[0].line.color = getCSSVar("--accent-color") || "#4a90e2";
    Plotly.react(frequencyChart, chartData, getPlotlyLayout(), plotlyConfig);
    Plotly.Plots.resize(frequencyChart);
  };

  const initChart = (frequency = [], magnitude = []) => {
    chartData[0].x = frequency;
    chartData[0].y = magnitude;
    chartData[0].line.color = getCSSVar("--accent-color") || "#4a90e2";
    Plotly.newPlot(frequencyChart, chartData, getPlotlyLayout(), plotlyConfig).then(() => {
      chartInitialized = true;
      Plotly.Plots.resize(frequencyChart);
    });
  };

  const updateChart = (frequency, magnitude) => {
    chartData[0].x = frequency;
    chartData[0].y = magnitude;
    if (chartInitialized) {
      refreshChart();
    } else {
      initChart(frequency, magnitude);
    }
  };

  const applyTranslations = () => {
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      const key = element.dataset.i18n;
      const attr = element.dataset.i18nAttr || "text";
      const translation = t(key);
      if (attr === "value") {
        element.value = translation;
      } else if (attr === "html") {
        element.innerHTML = translation;
      } else {
        element.textContent = translation;
      }
    });
    updateThemeToggleLabel();
    renderStatus();
    renderTransferMessage();
    refreshChart();
    updateSliderLabels();
  };

  const updateThemeToggleLabel = () => {
    themeToggle.textContent = t(currentTheme === "dark" ? "toggle_light" : "toggle_dark");
    themeToggle.setAttribute("aria-pressed", currentTheme === "dark");
  };

  const setLanguage = (lang, { skipStorage = false } = {}) => {
    if (!translations[lang]) {
      lang = "en";
    }
    currentLanguage = lang;
    document.documentElement.lang = lang;
    languageSelect.value = lang;
    if (!skipStorage) {
      localStorage.setItem("eq-language", lang);
    }
    applyTranslations();
  };

  const setTheme = (theme, { skipStorage = false } = {}) => {
    currentTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", currentTheme);
    if (!skipStorage) {
      localStorage.setItem("eq-theme", currentTheme);
    }
    updateThemeToggleLabel();
    refreshChart();
  };

  const readErrorMessage = async (response, fallback) => {
    try {
      const data = await response.json();
      return data.error || fallback;
    } catch {
      return fallback;
    }
  };

  uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!audioFileInput.files.length) {
      setStatus({ key: "status_upload_failed", detailKey: "status_ready" }, "error");
      return;
    }

    const formData = new FormData();
    formData.append("audio", audioFileInput.files[0]);

    setStatus("status_uploading", "info");
    setTransferMessage("transfer_default");
    applyButton.disabled = true;
    processedAudio.removeAttribute("src");
    processedAudio.load();

    try {
      const response = await fetch("/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const message = await readErrorMessage(response, "Upload failed.");
        throw new Error(message);
      }

      const data = await response.json();
      audioId = data.audioId;
      originalAudio.src = data.originalAudio;
      originalAudio.load();

      updateSliderLabels();
      updateChart(data.frequency, data.magnitude);

      setStatus("status_upload_success", "success");
      setTransferMessage("transfer_ready");
      applyButton.disabled = false;
    } catch (err) {
      console.error(err);
      setStatus({ key: "status_upload_failed", detail: err.message }, "error");
      setTransferMessage("transfer_error");
      applyButton.disabled = false;
    }
  });

  applyButton.addEventListener("click", async () => {
    if (!audioId) {
      setStatus({ key: "status_upload_failed", detailKey: "status_ready" }, "error");
      return;
    }

    const gains = sliders.map((slider) => Number(slider.value));
    const filterType = filterRadios.find((radio) => radio.checked)?.value ?? "IIR";

    setStatus("status_processing", "info");
    setTransferMessage("transfer_processing");
    applyButton.disabled = true;

    try {
      const response = await fetch("/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioId, gains, filterType }),
      });

      if (!response.ok) {
        const message = await readErrorMessage(response, "Processing failed.");
        throw new Error(message);
      }

      const data = await response.json();
      processedAudio.src = data.processedAudio;
      processedAudio.load();
      updateChart(data.frequency, data.magnitude);

      if (data.transferFunctionLatex && data.transferFunction) {
        setTransferMessage("custom", {
          latex: data.transferFunctionLatex,
          text: data.transferFunction,
        });
      } else {
        setTransferMessage("transfer_error");
      }

      setStatus("status_processing_success", "success");
    } catch (err) {
      console.error(err);
      setStatus({ key: "status_processing_failed", detail: err.message }, "error");
      setTransferMessage("transfer_error");
    } finally {
      applyButton.disabled = false;
    }
  });

  sliders.forEach((slider) => {
    slider.addEventListener("input", () => {
      const label = document.getElementById(`${slider.id}-label`);
      if (label) {
        label.textContent = formatGain(slider.value);
      }
    });
  });

  languageSelect.addEventListener("change", (event) => {
    setLanguage(event.target.value);
  });

  themeToggle.addEventListener("click", () => {
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
  });

  const storedLang = localStorage.getItem("eq-language");
  if (storedLang && translations[storedLang]) {
    currentLanguage = storedLang;
  }
  document.documentElement.lang = currentLanguage;
  languageSelect.value = currentLanguage;

  const storedTheme = localStorage.getItem("eq-theme");
  if (storedTheme === "dark") {
    currentTheme = "dark";
  }
  document.documentElement.setAttribute("data-theme", currentTheme);
  updateThemeToggleLabel();

  setStatus("status_ready", "info");
  setTransferMessage("transfer_default");
  initChart();
  applyTranslations();
  updateSliderLabels();
})();
