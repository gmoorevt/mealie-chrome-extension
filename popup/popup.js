// Popup script for Mealie Recipe Importer

// DOM Elements
const currentUrlElement = document.getElementById('current-url');
const detectionStatus = document.getElementById('detection-status');
const btnImport = document.getElementById('btn-import');
const methodHint = document.getElementById('method-hint');
const includeTagsCheckbox = document.getElementById('include-tags');
const btnAdvancedToggle = document.getElementById('btn-advanced-toggle');
const advancedOptions = document.getElementById('advanced-options');
const methodDescription = document.getElementById('method-description');
const statusArea = document.getElementById('status-area');
const statusMessage = document.getElementById('status-message');
const recipeLink = document.getElementById('recipe-link');
const btnTryAnother = document.getElementById('btn-try-another');
const btnSettings = document.getElementById('btn-settings');
const btnDebug = document.getElementById('btn-debug');
const btnDebugSections = document.getElementById('btn-debug-sections');

// Method buttons
const methodButtons = document.querySelectorAll('.btn-method');

// State
let currentTabUrl = '';
let currentTabId = null;
let mealieApi = null;
let settings = null;
let pageAnalysis = null;
let selectedMethod = 'auto';
let recommendedMethod = 'url';

// Known domains that work better with specific methods
const DOMAIN_PREFERENCES = {
  // Sites that need JSON-LD extraction (behind auth or complex HTML)
  'americastestkitchen.com': 'jsonld',
  'cooksillustrated.com': 'jsonld',
  'cookscountry.com': 'jsonld',
  'nytimes.com': 'jsonld',
  'cooking.nytimes.com': 'jsonld',
  'bonappetit.com': 'jsonld',
  'epicurious.com': 'jsonld',

  // Sites that work well with URL import
  'allrecipes.com': 'url',
  'foodnetwork.com': 'url',
  'food.com': 'url',
  'simplyrecipes.com': 'url',
  'seriouseats.com': 'url',
  'budgetbytes.com': 'url',
  'tasty.co': 'url',
};

// Method descriptions
const METHOD_DESCRIPTIONS = {
  auto: 'Automatically choose the best method for this site.',
  url: 'Send URL to Mealie server to fetch and parse.',
  jsonld: 'Extract recipe data embedded in the page.',
  html: 'Send full page HTML for parsing.'
};

// Initialize popup
document.addEventListener('DOMContentLoaded', initialize);

// Event listeners
btnImport.addEventListener('click', handleImport);
btnAdvancedToggle.addEventListener('click', toggleAdvancedOptions);
btnSettings.addEventListener('click', openSettings);
btnDebug.addEventListener('click', handleDebug);
btnDebugSections.addEventListener('click', handleDebugSections);
btnTryAnother.addEventListener('click', showAdvancedAndRetry);
recipeLink.addEventListener('click', openRecipeLink);
includeTagsCheckbox.addEventListener('change', saveIncludeTagsPreference);

// Method button listeners
methodButtons.forEach(btn => {
  btn.addEventListener('click', () => selectMethod(btn.dataset.method));
});

/**
 * Initialize the popup
 */
async function initialize() {
  try {
    // Get current tab info
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabUrl = tab.url;
    currentTabId = tab.id;

    // Display current URL
    displayCurrentUrl(currentTabUrl);

    // Load settings and create API instance
    const result = await createMealieAPIFromStorage();
    mealieApi = result.api;
    settings = result.settings;

    // Set include tags checkbox from settings
    includeTagsCheckbox.checked = settings.includeTags;

    // Load domain preferences from storage
    await loadDomainPreferences();

    // Analyze the page for recipe data
    await analyzeCurrentPage();

    // Enable the import button
    btnImport.disabled = false;
  } catch (error) {
    if (error.message.includes('not configured')) {
      showNotConfigured();
    } else {
      showStatus(`Error: ${error.message}`, 'error');
    }
  }
}

/**
 * Display the current page URL
 */
function displayCurrentUrl(url) {
  try {
    const urlObj = new URL(url);
    currentUrlElement.textContent = urlObj.hostname + urlObj.pathname;
    currentUrlElement.title = url;
  } catch {
    currentUrlElement.textContent = url;
  }
}

/**
 * Analyze the current page for recipe data
 */
async function analyzeCurrentPage() {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: currentTabId },
      func: detectRecipeData
    });

    pageAnalysis = results[0].result;

    // Update detection status
    updateDetectionStatus(pageAnalysis);

    // Determine recommended method
    determineRecommendedMethod();

    // Update UI
    updateMethodHint();
  } catch (error) {
    console.error('Page analysis failed:', error);
    // Default to URL method if analysis fails
    recommendedMethod = 'url';
    updateMethodHint();
  }
}

/**
 * Function injected to detect recipe data on the page
 */
function detectRecipeData() {
  const analysis = {
    hasJsonLd: false,
    hasMicrodata: false,
    recipeName: null,
    htmlSize: document.documentElement.outerHTML.length,
    domain: window.location.hostname
  };

  // Check JSON-LD
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of jsonLdScripts) {
    try {
      const data = JSON.parse(script.textContent);
      let recipe = null;

      if (Array.isArray(data)) {
        recipe = data.find(item => item['@type'] === 'Recipe');
      } else if (data['@type'] === 'Recipe') {
        recipe = data;
      } else if (data['@graph']) {
        recipe = data['@graph'].find(item =>
          item['@type'] === 'Recipe' ||
          (Array.isArray(item['@type']) && item['@type'].includes('Recipe'))
        );
      }

      if (recipe) {
        analysis.hasJsonLd = true;
        analysis.recipeName = recipe.name || null;
        break;
      }
    } catch (e) {
      // Continue checking other scripts
    }
  }

  // Check microdata
  const microdataElements = document.querySelectorAll('[itemtype*="schema.org/Recipe"]');
  if (microdataElements.length > 0) {
    analysis.hasMicrodata = true;
    if (!analysis.recipeName) {
      const nameEl = microdataElements[0].querySelector('[itemprop="name"]');
      if (nameEl) {
        analysis.recipeName = nameEl.textContent.trim();
      }
    }
  }

  return analysis;
}

/**
 * Update the detection status display
 */
function updateDetectionStatus(analysis) {
  if (analysis.hasJsonLd || analysis.hasMicrodata) {
    detectionStatus.className = 'detection-status found';
    detectionStatus.querySelector('.detection-icon').textContent = '✓';
    const recipeName = analysis.recipeName
      ? `"${analysis.recipeName.substring(0, 30)}${analysis.recipeName.length > 30 ? '...' : ''}"`
      : 'Recipe';
    detectionStatus.querySelector('.detection-text').textContent = `${recipeName} detected`;
  } else {
    detectionStatus.className = 'detection-status not-found';
    detectionStatus.querySelector('.detection-icon').textContent = '?';
    detectionStatus.querySelector('.detection-text').textContent = 'No recipe schema found';
  }
}

/**
 * Determine the recommended import method
 */
function determineRecommendedMethod() {
  const domain = getDomain(currentTabUrl);

  // Check if we have a stored preference for this domain (from successful imports)
  const storedPref = settings.domainMethods?.[domain];
  if (storedPref) {
    recommendedMethod = storedPref;
    return;
  }

  // Check known domain preferences
  for (const [knownDomain, method] of Object.entries(DOMAIN_PREFERENCES)) {
    if (domain.includes(knownDomain)) {
      recommendedMethod = method;
      return;
    }
  }

  // Smart detection based on page analysis
  if (pageAnalysis) {
    // Large pages with JSON-LD should use JSON-LD extraction
    if (pageAnalysis.htmlSize > 500000 && pageAnalysis.hasJsonLd) {
      recommendedMethod = 'jsonld';
      return;
    }

    // Pages with JSON-LD but no clear public access might need JSON-LD
    if (pageAnalysis.hasJsonLd && !pageAnalysis.hasMicrodata) {
      // Check if URL seems to require auth
      if (currentTabUrl.includes('/member') || currentTabUrl.includes('/subscriber')) {
        recommendedMethod = 'jsonld';
        return;
      }
    }
  }

  // Default to URL for most sites
  recommendedMethod = 'url';
}

/**
 * Update the method hint text
 */
function updateMethodHint() {
  const method = selectedMethod === 'auto' ? recommendedMethod : selectedMethod;

  const methodNames = {
    url: 'URL import',
    jsonld: 'Schema extraction',
    html: 'HTML parsing'
  };

  if (selectedMethod === 'auto') {
    methodHint.textContent = `Will use ${methodNames[method]} for this site`;
  } else {
    methodHint.textContent = `Using ${methodNames[method]}`;
  }
}

/**
 * Get domain from URL
 */
function getDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return '';
  }
}

/**
 * Handle main import button click
 */
async function handleImport() {
  const method = selectedMethod === 'auto' ? recommendedMethod : selectedMethod;

  btnImport.disabled = true;
  showStatus('<span class="spinner"></span>Importing recipe...', 'loading');

  try {
    let result;
    const includeTags = includeTagsCheckbox.checked;

    switch (method) {
      case 'url':
        result = await importViaUrl(includeTags);
        break;
      case 'jsonld':
        result = await importViaJsonLd();
        break;
      case 'html':
        result = await importViaHtml();
        break;
    }

    // Save successful method for this domain
    await saveDomainPreference(getDomain(currentTabUrl), method);

    const recipeUrl = mealieApi.getRecipeUrl(result.slug, settings.groupSlug);
    showSuccess('Recipe imported successfully!', recipeUrl);
  } catch (error) {
    console.error('Import error:', error);
    handleImportError(error);
  } finally {
    btnImport.disabled = false;
  }
}

/**
 * Import via URL (Simple Import)
 */
async function importViaUrl(includeTags) {
  const result = await mealieApi.importFromUrl(currentTabUrl, includeTags);
  const slug = typeof result === 'string' ? result.replace(/"/g, '') : result.slug || result;
  return { slug };
}

/**
 * Import via JSON-LD extraction
 */
async function importViaJsonLd() {
  // Extract JSON-LD and additional sections from page
  const results = await chrome.scripting.executeScript({
    target: { tabId: currentTabId },
    func: extractJsonLdRecipe
  });

  const extraction = results[0].result;
  console.log('Extraction result:', extraction);
  console.log('Additional sections found:', extraction.additionalSections);

  if (!extraction.found) {
    throw new Error('No recipe data found on this page');
  }

  // Import the recipe first (without notes - Mealie ignores them in JSON-LD)
  const result = await mealieApi.importFromJson(extraction.recipe);
  const slug = typeof result === 'string' ? result.replace(/"/g, '') : result.slug || result;
  console.log('Recipe imported with slug:', slug);

  // If we extracted additional sections, add them as notes via PATCH
  if (extraction.additionalSections && extraction.additionalSections.length > 0) {
    console.log('Attempting to add notes:', extraction.additionalSections);
    try {
      const notes = extraction.additionalSections.map(section => ({
        title: section.title,
        text: section.content
      }));
      console.log('Formatted notes for Mealie:', notes);
      const patchResult = await mealieApi.addNotesToRecipe(slug, notes);
      console.log('PATCH result:', patchResult);
    } catch (noteError) {
      // Don't fail the whole import if notes fail
      console.error('Failed to add notes to recipe:', noteError);
    }
  } else {
    console.log('No additional sections to add');
  }

  return { slug };
}

/**
 * Import via HTML parsing
 */
async function importViaHtml() {
  const results = await chrome.scripting.executeScript({
    target: { tabId: currentTabId },
    func: () => document.documentElement.outerHTML
  });

  const html = results[0].result;
  const result = await mealieApi.importFromHtml(html);
  const slug = typeof result === 'string' ? result.replace(/"/g, '') : result.slug || result;
  return { slug };
}

/**
 * Extract JSON-LD recipe data from page
 * Also extracts additional content sections for sites like ATK
 * NOTE: This function is injected into the page, so all helpers must be inlined
 */
function extractJsonLdRecipe() {
  // Helper: Get text content following a header element
  function getFollowingContent(headerElement) {
    let content = [];
    let sibling = headerElement.nextElementSibling;
    let iterations = 0;
    const maxIterations = 10;

    // Check if header is inside a container with more content
    const parent = headerElement.parentElement;
    if (parent) {
      const parentText = parent.textContent.trim();
      const headerText = headerElement.textContent.trim();
      if (parentText.length > headerText.length + 50) {
        const remainingText = parentText.replace(headerText, '').trim();
        if (remainingText.length > 50) {
          return remainingText;
        }
      }
    }

    while (sibling && iterations < maxIterations) {
      if (['H1', 'H2', 'H3', 'H4'].includes(sibling.tagName)) {
        break;
      }
      const text = sibling.textContent.trim();
      if (text) {
        content.push(text);
      }
      sibling = sibling.nextElementSibling;
      iterations++;
    }

    return content.join('\n\n');
  }

  // Helper: Extract ATK sections
  function extractATKSections() {
    const sections = [];
    const domain = window.location.hostname;

    if (!domain.includes('americastestkitchen.com') &&
        !domain.includes('cooksillustrated.com') &&
        !domain.includes('cookscountry.com')) {
      return sections;
    }

    let whySection = null;
    let beforeSection = null;

    // Method 1: Look for headers and get following content
    const allHeaders = document.querySelectorAll('h2, h3, h4, [role="heading"]');
    allHeaders.forEach(header => {
      const headerText = header.textContent.trim().toLowerCase();

      if (!whySection && (headerText.includes('why this recipe works') || headerText.includes('why it works'))) {
        const content = getFollowingContent(header);
        if (content && content.length > 20) {
          whySection = content;
        }
      }

      if (!beforeSection && (headerText.includes('before you begin') || headerText.includes('getting started'))) {
        const content = getFollowingContent(header);
        if (content && content.length > 20) {
          beforeSection = content;
        }
      }
    });

    // Method 2: ATK-specific class patterns
    if (!beforeSection) {
      const beforeElements = document.querySelectorAll(
        '[class*="beforeYouBegin"], [class*="BeforeYouBegin"], [class*="before-you-begin"]'
      );
      beforeElements.forEach(el => {
        if (!beforeSection) {
          const text = el.textContent.trim();
          if (text.length > 20 && text.length < 10000) {
            beforeSection = text;
          }
        }
      });
    }

    // Method 3: Generic class patterns for "why" sections
    if (!whySection) {
      const whyElements = document.querySelectorAll(
        '[class*="WhyThis"], [class*="whyThis"], [class*="why-this"], [data-testid*="why"]'
      );
      whyElements.forEach(el => {
        if (!whySection) {
          const text = el.textContent.trim();
          const cleanText = text.replace(/why this recipe works/i, '').trim();
          if (cleanText.length > 20 && cleanText.length < 10000) {
            whySection = cleanText;
          }
        }
      });
    }

    if (whySection) {
      sections.push({ title: 'Why This Recipe Works', content: whySection });
    }
    if (beforeSection) {
      sections.push({ title: 'Before You Begin', content: beforeSection });
    }

    return sections;
  }

  // Main extraction logic
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');

  for (const script of jsonLdScripts) {
    try {
      const data = JSON.parse(script.textContent);
      let recipe = null;

      if (Array.isArray(data)) {
        recipe = data.find(item => item['@type'] === 'Recipe');
      } else if (data['@type'] === 'Recipe') {
        recipe = data;
      } else if (data['@graph']) {
        recipe = data['@graph'].find(item =>
          item['@type'] === 'Recipe' ||
          (Array.isArray(item['@type']) && item['@type'].includes('Recipe'))
        );
      }

      if (recipe) {
        // Extract additional sections from the page (ATK, etc.)
        let additionalSections = [];
        try {
          additionalSections = extractATKSections();
        } catch (sectionError) {
          console.debug('Additional section extraction failed:', sectionError);
        }

        return { found: true, recipe, additionalSections };
      }
    } catch (e) {
      console.debug('JSON-LD parse error:', e);
    }
  }

  return { found: false, additionalSections: [] };
}

/**
 * Extract additional content sections from the page
 * Handles ATK's "Why This Recipe Works" and "Before You Begin" sections
 */
function extractAdditionalSections() {
  const sections = [];
  const domain = window.location.hostname;

  // ATK / Cook's Illustrated / Cook's Country specific extraction
  if (domain.includes('americastestkitchen.com') ||
      domain.includes('cooksillustrated.com') ||
      domain.includes('cookscountry.com')) {

    let whySection = null;
    let beforeSection = null;

    // Method 1: Look for headers and get following content
    const allHeaders = document.querySelectorAll('h2, h3, h4, [role="heading"]');
    allHeaders.forEach(header => {
      const headerText = header.textContent.trim().toLowerCase();

      if (!whySection && (headerText.includes('why this recipe works') || headerText.includes('why it works'))) {
        const content = getFollowingContent(header);
        if (content && content.length > 20) {
          whySection = content;
        }
      }

      if (!beforeSection && (headerText.includes('before you begin') || headerText.includes('getting started'))) {
        const content = getFollowingContent(header);
        if (content && content.length > 20) {
          beforeSection = content;
        }
      }
    });

    // Method 2: ATK-specific class patterns (from debug analysis)
    if (!beforeSection) {
      // Look for the specific ATK class pattern: recipePrintBody_beforeYouBeginContent__*
      const beforeElements = document.querySelectorAll(
        '[class*="beforeYouBegin"], [class*="BeforeYouBegin"], [class*="before-you-begin"]'
      );
      beforeElements.forEach(el => {
        if (!beforeSection) {
          const text = el.textContent.trim();
          if (text.length > 20 && text.length < 10000) {
            beforeSection = text;
          }
        }
      });
    }

    // Method 3: Generic class patterns for "why" sections
    if (!whySection) {
      const whyElements = document.querySelectorAll(
        '[class*="WhyThis"], [class*="whyThis"], [class*="why-this"], [data-testid*="why"]'
      );
      whyElements.forEach(el => {
        if (!whySection) {
          const text = el.textContent.trim();
          // Filter out the header text itself
          const cleanText = text.replace(/why this recipe works/i, '').trim();
          if (cleanText.length > 20 && cleanText.length < 10000) {
            whySection = cleanText;
          }
        }
      });
    }

    // Method 4: Look for recipe detail/body sections that might contain this info
    if (!whySection || !beforeSection) {
      const detailSections = document.querySelectorAll(
        '[class*="recipeDetail"], [class*="recipe-detail"], [class*="RecipeBody"], [class*="recipe-body"]'
      );
      detailSections.forEach(section => {
        const sectionText = section.textContent.toLowerCase();

        if (!whySection && sectionText.includes('why this recipe works')) {
          // Try to extract just that portion
          const paragraphs = section.querySelectorAll('p');
          paragraphs.forEach(p => {
            const pText = p.textContent.trim();
            if (!whySection && pText.length > 50 && !pText.toLowerCase().startsWith('before')) {
              whySection = pText;
            }
          });
        }
      });
    }

    if (whySection) {
      sections.push({ title: 'Why This Recipe Works', content: whySection });
    }

    if (beforeSection) {
      sections.push({ title: 'Before You Begin', content: beforeSection });
    }
  }

  // Generic extraction for other sites - look for common section patterns
  if (sections.length === 0) {
    const commonSectionHeaders = ['tips', 'notes', 'cook\'s notes', 'recipe notes', 'chef\'s notes'];
    const allHeaders = document.querySelectorAll('h2, h3, h4');

    allHeaders.forEach(header => {
      const headerText = header.textContent.trim().toLowerCase();
      if (commonSectionHeaders.some(term => headerText.includes(term))) {
        const content = getFollowingContent(header);
        if (content && content.length > 30) {
          sections.push({
            title: header.textContent.trim(),
            content: content
          });
        }
      }
    });
  }

  return sections;
}

/**
 * Get the text content following a header element
 */
function getFollowingContent(headerElement) {
  let content = [];
  let sibling = headerElement.nextElementSibling;
  let iterations = 0;
  const maxIterations = 10;

  // Also check if header is inside a container with more content
  const parent = headerElement.parentElement;
  if (parent) {
    const parentText = parent.textContent.trim();
    const headerText = headerElement.textContent.trim();
    if (parentText.length > headerText.length + 50) {
      // There's content in the parent beyond the header
      const remainingText = parentText.replace(headerText, '').trim();
      if (remainingText.length > 50) {
        return remainingText;
      }
    }
  }

  while (sibling && iterations < maxIterations) {
    // Stop if we hit another header
    if (['H1', 'H2', 'H3', 'H4'].includes(sibling.tagName)) {
      break;
    }

    const text = sibling.textContent.trim();
    if (text) {
      content.push(text);
    }

    sibling = sibling.nextElementSibling;
    iterations++;
  }

  return content.join('\n\n');
}

/**
 * Build enhanced description with additional sections
 */
function buildEnhancedDescription(originalDescription, sections) {
  let description = originalDescription || '';

  sections.forEach(section => {
    if (section.content) {
      if (description) {
        description += '\n\n';
      }
      description += `**${section.title}**\n${section.content}`;
    }
  });

  return description;
}

/**
 * Handle import errors
 */
function handleImportError(error) {
  let message = 'Import failed';

  if (error.status === 401) {
    message = 'Authentication failed. Check your API token in settings.';
  } else if (error.status === 400 || error.status === 422) {
    message = 'Could not parse recipe. Try a different method.';
    btnTryAnother.classList.remove('hidden');
  } else if (error.message) {
    message = error.message;
  }

  showStatus(message, 'error');
}

/**
 * Show status message
 */
function showStatus(message, type) {
  statusArea.className = `status-area ${type}`;
  statusMessage.innerHTML = message;
  recipeLink.classList.add('hidden');
  if (type !== 'error') {
    btnTryAnother.classList.add('hidden');
  }
}

/**
 * Show success message
 */
function showSuccess(message, recipeUrl) {
  statusArea.className = 'status-area success';
  statusMessage.textContent = message;
  recipeLink.dataset.url = recipeUrl;
  recipeLink.classList.remove('hidden');
  btnTryAnother.classList.add('hidden');
}

/**
 * Open recipe link in new window
 */
function openRecipeLink() {
  const url = recipeLink.dataset.url;
  if (url) {
    chrome.tabs.create({ url: url });
  }
}

/**
 * Toggle advanced options visibility
 */
function toggleAdvancedOptions() {
  const isHidden = advancedOptions.classList.contains('hidden');
  advancedOptions.classList.toggle('hidden');
  btnAdvancedToggle.textContent = isHidden ? 'Hide options' : 'Advanced options';
}

/**
 * Show advanced options and prepare for retry
 */
function showAdvancedAndRetry() {
  advancedOptions.classList.remove('hidden');
  btnAdvancedToggle.textContent = 'Hide options';
  btnTryAnother.classList.add('hidden');
  statusArea.classList.add('hidden');
}

/**
 * Select an import method
 */
function selectMethod(method) {
  selectedMethod = method;

  // Update button states
  methodButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.method === method);
  });

  // Update description
  methodDescription.textContent = METHOD_DESCRIPTIONS[method];

  // Update hint
  updateMethodHint();
}

/**
 * Load domain preferences from storage
 */
async function loadDomainPreferences() {
  try {
    const stored = await chrome.storage.sync.get({ domainMethods: {} });
    settings.domainMethods = stored.domainMethods;
  } catch (e) {
    settings.domainMethods = {};
  }
}

/**
 * Save successful method for a domain
 */
async function saveDomainPreference(domain, method) {
  try {
    const stored = await chrome.storage.sync.get({ domainMethods: {} });
    stored.domainMethods[domain] = method;
    await chrome.storage.sync.set({ domainMethods: stored.domainMethods });
  } catch (e) {
    console.error('Failed to save domain preference:', e);
  }
}

/**
 * Save include tags preference
 */
async function saveIncludeTagsPreference() {
  try {
    await chrome.storage.sync.set({ includeTags: includeTagsCheckbox.checked });
  } catch (error) {
    console.error('Failed to save preference:', error);
  }
}

/**
 * Show not configured state
 */
function showNotConfigured() {
  const main = document.querySelector('main');
  main.innerHTML = `
    <div class="not-configured">
      <p>Connect to your Mealie instance to start importing recipes.</p>
      <button class="btn-configure" id="btn-configure">Set Up Connection</button>
    </div>
  `;
  document.getElementById('btn-configure').addEventListener('click', openSettings);
}

/**
 * Open settings page
 */
function openSettings() {
  chrome.runtime.openOptionsPage();
}

/**
 * Handle debug button click
 */
async function handleDebug() {
  if (!currentTabId) return;

  showStatus('<span class="spinner"></span>Analyzing page...', 'loading');

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: currentTabId },
      func: analyzePageForRecipes
    });

    const analysis = results[0].result;
    showDebugResults(analysis);
  } catch (error) {
    showStatus(`Debug failed: ${error.message}`, 'error');
  }
}

/**
 * Full page analysis for debug
 */
function analyzePageForRecipes() {
  const analysis = {
    url: window.location.href,
    title: document.title,
    jsonLd: [],
    microdata: [],
    htmlSize: document.documentElement.outerHTML.length,
    hasRecipeSchema: false,
    errors: [],
    possibleIssues: []
  };

  // Check JSON-LD
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  jsonLdScripts.forEach((script, index) => {
    try {
      const data = JSON.parse(script.textContent);
      let recipeFound = null;

      if (Array.isArray(data)) {
        recipeFound = data.find(item => item['@type'] === 'Recipe');
      } else if (data['@type'] === 'Recipe') {
        recipeFound = data;
      } else if (data['@graph']) {
        recipeFound = data['@graph'].find(item =>
          item['@type'] === 'Recipe' ||
          (Array.isArray(item['@type']) && item['@type'].includes('Recipe'))
        );
      }

      analysis.jsonLd.push({
        index,
        type: data['@type'] || (data['@graph'] ? '@graph' : 'unknown'),
        hasRecipe: !!recipeFound,
        recipeName: recipeFound?.name || null
      });

      if (recipeFound) analysis.hasRecipeSchema = true;
    } catch (e) {
      analysis.jsonLd.push({ index, error: e.message });
      analysis.errors.push(`JSON-LD ${index}: ${e.message}`);
    }
  });

  // Check microdata
  const microdataElements = document.querySelectorAll('[itemtype*="schema.org/Recipe"]');
  microdataElements.forEach((el, index) => {
    analysis.microdata.push({
      index,
      propsCount: el.querySelectorAll('[itemprop]').length
    });
    analysis.hasRecipeSchema = true;
  });

  // Check for issues
  const bodyText = document.body.innerText.toLowerCase();
  if (bodyText.includes('sign in') || bodyText.includes('log in')) {
    analysis.possibleIssues.push('Page may require authentication');
  }
  if (analysis.htmlSize < 5000) {
    analysis.possibleIssues.push('Page HTML is very small');
  }
  if (analysis.htmlSize > 500000) {
    analysis.possibleIssues.push('Large page - Schema extraction recommended');
  }

  return analysis;
}

/**
 * Display debug results
 */
function showDebugResults(analysis) {
  statusArea.className = 'status-area';

  let html = '<div class="debug-info"><h3>Page Analysis</h3>';

  html += '<div class="debug-item">';
  html += '<div class="debug-label">Recipe Schema:</div>';
  html += `<div class="debug-value ${analysis.hasRecipeSchema ? 'success' : 'error'}">`;
  html += analysis.hasRecipeSchema ? '✓ Found' : '✗ Not found';
  html += '</div></div>';

  html += '<div class="debug-item">';
  html += `<div class="debug-label">HTML Size: ${(analysis.htmlSize / 1024).toFixed(1)} KB</div>`;
  html += '</div>';

  html += '<div class="debug-item">';
  html += `<div class="debug-label">JSON-LD Scripts: ${analysis.jsonLd.length}</div>`;
  analysis.jsonLd.forEach(item => {
    if (item.error) {
      html += `<div class="debug-value error">Script ${item.index}: Error</div>`;
    } else {
      html += `<div class="debug-value ${item.hasRecipe ? 'success' : 'warning'}">`;
      html += `Script ${item.index}: ${item.hasRecipe ? '✓ Recipe' : 'No recipe'} (${item.type})`;
      html += '</div>';
    }
  });
  html += '</div>';

  if (analysis.possibleIssues.length > 0) {
    html += '<div class="debug-item">';
    html += '<div class="debug-label">Notes:</div>';
    analysis.possibleIssues.forEach(issue => {
      html += `<div class="debug-value warning">⚠ ${issue}</div>`;
    });
    html += '</div>';
  }

  html += '</div>';
  statusMessage.innerHTML = html;
  recipeLink.classList.add('hidden');
  btnTryAnother.classList.add('hidden');
}

/**
 * Handle debug sections button click - specifically for ATK section extraction
 */
async function handleDebugSections() {
  if (!currentTabId) return;

  showStatus('<span class="spinner"></span>Analyzing page sections...', 'loading');

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: currentTabId },
      func: debugATKSections
    });

    const analysis = results[0].result;
    showSectionDebugResults(analysis);
  } catch (error) {
    showStatus(`Section debug failed: ${error.message}`, 'error');
  }
}

/**
 * Debug function to analyze ATK page structure
 */
function debugATKSections() {
  const analysis = {
    domain: window.location.hostname,
    headers: [],
    potentialSections: [],
    classPatterns: [],
    errors: []
  };

  try {
    // Find all headers and their context
    const allHeaders = document.querySelectorAll('h1, h2, h3, h4, h5, [role="heading"]');
    allHeaders.forEach((header, index) => {
      const headerText = header.textContent.trim();
      const headerLower = headerText.toLowerCase();

      // Check if this looks like a section we want
      const isRelevant = headerLower.includes('why') ||
                         headerLower.includes('before') ||
                         headerLower.includes('works') ||
                         headerLower.includes('begin') ||
                         headerLower.includes('tips') ||
                         headerLower.includes('notes');

      if (isRelevant || index < 10) {  // First 10 headers + any relevant ones
        const headerInfo = {
          index,
          tag: header.tagName,
          text: headerText.substring(0, 100),
          className: header.className,
          id: header.id,
          parentClass: header.parentElement?.className || '',
          parentTag: header.parentElement?.tagName || '',
          isRelevant
        };

        // Try to get following content
        let nextSibling = header.nextElementSibling;
        if (nextSibling) {
          headerInfo.nextSiblingTag = nextSibling.tagName;
          headerInfo.nextSiblingClass = nextSibling.className;
          headerInfo.nextSiblingTextPreview = nextSibling.textContent?.substring(0, 200);
        }

        // Check parent for more content
        const parent = header.parentElement;
        if (parent) {
          const parentText = parent.textContent.trim();
          const headerTextLen = headerText.length;
          if (parentText.length > headerTextLen + 50) {
            headerInfo.parentHasMoreContent = true;
            headerInfo.parentContentPreview = parentText.substring(headerTextLen, headerTextLen + 300);
          }
        }

        analysis.headers.push(headerInfo);
      }
    });

    // Look for elements with relevant class names
    const relevantClassPatterns = [
      '[class*="why"]', '[class*="Why"]',
      '[class*="before"]', '[class*="Before"]',
      '[class*="works"]', '[class*="Works"]',
      '[class*="begin"]', '[class*="Begin"]',
      '[class*="recipe-body"]', '[class*="RecipeBody"]',
      '[class*="recipe-intro"]', '[class*="RecipeIntro"]',
      '[data-testid*="why"]', '[data-testid*="before"]'
    ];

    relevantClassPatterns.forEach(pattern => {
      try {
        const elements = document.querySelectorAll(pattern);
        elements.forEach(el => {
          analysis.classPatterns.push({
            pattern,
            tag: el.tagName,
            className: el.className,
            id: el.id,
            textPreview: el.textContent?.substring(0, 300)
          });
        });
      } catch (e) {
        // Invalid selector, skip
      }
    });

    // Look for specific ATK patterns
    const atkPatterns = document.querySelectorAll('[class*="Detail"], [class*="detail"], [class*="Section"], [class*="section"]');
    atkPatterns.forEach(el => {
      const text = el.textContent?.toLowerCase() || '';
      if (text.includes('why this recipe works') || text.includes('before you begin')) {
        analysis.potentialSections.push({
          tag: el.tagName,
          className: el.className,
          id: el.id,
          textPreview: el.textContent?.substring(0, 500)
        });
      }
    });

  } catch (e) {
    analysis.errors.push(e.message);
  }

  return analysis;
}

/**
 * Display section debug results
 */
function showSectionDebugResults(analysis) {
  statusArea.className = 'status-area';

  let html = '<div class="debug-info"><h3>ATK Section Analysis</h3>';

  html += `<div class="debug-item"><div class="debug-label">Domain: ${analysis.domain}</div></div>`;

  // Show relevant headers
  html += '<div class="debug-item"><div class="debug-label">Relevant Headers Found:</div>';
  const relevantHeaders = analysis.headers.filter(h => h.isRelevant);
  if (relevantHeaders.length === 0) {
    html += '<div class="debug-value warning">No headers with "why", "before", "works", "begin" found</div>';
  } else {
    relevantHeaders.forEach(h => {
      html += `<div class="debug-value">`;
      html += `<strong>&lt;${h.tag}&gt;</strong> "${h.text}"<br>`;
      html += `<small>class="${h.className}" | parent: ${h.parentTag}.${h.parentClass}</small>`;
      if (h.nextSiblingTextPreview) {
        html += `<br><small>Next sibling preview: "${h.nextSiblingTextPreview?.substring(0, 100)}..."</small>`;
      }
      if (h.parentHasMoreContent) {
        html += `<br><small>Parent content: "${h.parentContentPreview?.substring(0, 100)}..."</small>`;
      }
      html += '</div>';
    });
  }
  html += '</div>';

  // Show class pattern matches
  if (analysis.classPatterns.length > 0) {
    html += '<div class="debug-item"><div class="debug-label">Class Pattern Matches:</div>';
    analysis.classPatterns.slice(0, 10).forEach(p => {
      html += `<div class="debug-value">`;
      html += `Pattern: ${p.pattern}<br>`;
      html += `<small>${p.tag} class="${p.className}"</small><br>`;
      html += `<small>Preview: "${p.textPreview?.substring(0, 150)}..."</small>`;
      html += '</div>';
    });
    html += '</div>';
  }

  // Show potential sections
  if (analysis.potentialSections.length > 0) {
    html += '<div class="debug-item"><div class="debug-label">Potential ATK Sections:</div>';
    analysis.potentialSections.forEach(s => {
      html += `<div class="debug-value success">`;
      html += `${s.tag} class="${s.className}"<br>`;
      html += `<small>Preview: "${s.textPreview?.substring(0, 200)}..."</small>`;
      html += '</div>';
    });
    html += '</div>';
  }

  // Show errors
  if (analysis.errors.length > 0) {
    html += '<div class="debug-item"><div class="debug-label">Errors:</div>';
    analysis.errors.forEach(e => {
      html += `<div class="debug-value error">${e}</div>`;
    });
    html += '</div>';
  }

  html += '</div>';
  statusMessage.innerHTML = html;
  recipeLink.classList.add('hidden');
  btnTryAnother.classList.add('hidden');
}
