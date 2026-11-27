const topicOptions = [
  { value: 'events', label: 'Plan an event' },
  { value: 'desserts', label: 'Order celebration desserts' },
  { value: 'apparels', label: 'Ask about apparel' },
  { value: 'general', label: 'General question' }
];
const namePattern = /^[\p{L}\p{M}\p{N} &.,'’\u2010-\u2015-]+$/u;
const MAX_REFERENCE_IMAGES = 3;
const MAX_REFERENCE_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_REFERENCE_TOTAL_BYTES = 5 * 1024 * 1024;
const REFERENCE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const serviceOptions = {
  events: {
    key: 'eventType',
    question: 'What are you celebrating?',
    options: ['Birthday', 'Wedding', 'Graduation', 'Anniversary', 'Baby shower', 'Bridal shower', 'Engagement party', 'Corporate event', 'Family gathering', 'Other']
  },
  desserts: {
    key: 'dessertType',
    question: 'What are you looking for?',
    options: ['Celebration cake', 'Wedding cake', 'Cupcakes', 'Cookies & treats', 'Dessert boxes', 'Dessert table', 'Other desserts']
  },
  apparels: {
    key: 'apparelCategory',
    question: 'What would you like to know about?',
    options: ['Clothing', 'Shoes', 'Handbags', 'Accessories', 'Other']
  }
};

const contactForm = document.getElementById('contactForm');
const stepContent = document.getElementById('contactStepContent');
const stepCount = document.getElementById('contactStepCount');
const progress = document.getElementById('contactProgress');
const backButton = document.getElementById('contactStepBack');
const nextButton = document.getElementById('contactStepNext');
const submitButton = document.getElementById('contactStepSubmit');
const actions = document.getElementById('contactStepActions');
const contactStatus = document.getElementById('contactStatus');
const requestedTopic = new URLSearchParams(window.location.search).get('topic');
const initialTopic = topicOptions.some((topic) => topic.value === requestedTopic) ? requestedTopic : '';
const shouldAskTopic = !initialTopic;
const state = {
  topic: initialTopic,
  eventType: '',
  eventOtherType: '',
  dessertType: '',
  dessertOtherType: '',
  apparelCategory: '',
  apparelOtherCategory: '',
  message: '',
  name: '',
  email: '',
  referenceImages: [],
  captchaToken: ''
};
let currentStep = 0;
let submitted = false;
let captchaWidgetId = null;
let captchaUnavailable = false;

function getSteps() {
  const steps = [];
  if (shouldAskTopic) {
    steps.push({
      key: 'topic',
      question: 'What can we help you with?',
      prompt: 'Choose the option that best fits.',
      type: 'choices',
      options: topicOptions
    });
  }

  const service = serviceOptions[state.topic];
  if (service) {
    steps.push({
      key: service.key,
      question: service.question,
      prompt: 'Choose one option to get started.',
      type: 'choices',
      options: service.options.map((option) => ({ value: option, label: option }))
    });
  }

  if (state.topic === 'events' && state.eventType === 'Other') {
    steps.push({
      key: 'eventOtherType',
      question: 'What kind of event are you planning?',
      prompt: 'Add a short description so we know what you are celebrating.',
      type: 'text',
      label: 'Event type',
      placeholder: 'For example, a reunion or retirement celebration',
      required: true,
      maxLength: 100
    });
  }
  if (state.topic === 'desserts' && state.dessertType === 'Other desserts') {
    steps.push({
      key: 'dessertOtherType',
      question: 'What kind of dessert are you looking for?',
      prompt: 'Add a short description so we know what you need.',
      type: 'text',
      label: 'Dessert type',
      placeholder: 'For example, dessert jars or a custom treat',
      required: true,
      maxLength: 100
    });
  }
  if (state.topic === 'apparels' && state.apparelCategory === 'Other') {
    steps.push({
      key: 'apparelOtherCategory',
      question: 'What kind of apparel are you asking about?',
      prompt: 'Add a short description so we know what you are looking for.',
      type: 'text',
      label: 'Apparel category',
      placeholder: 'For example, formal wear or a custom accessory',
      required: true,
      maxLength: 100
    });
  }

  steps.push(
    {
      key: 'message',
      question: 'Anything else we should know?',
      prompt: 'Please add a message so we can help with your inquiry.',
      type: 'textarea',
      label: 'Your message',
      placeholder: 'Add a detail or question',
      required: true,
      maxLength: 2000
    },
    {
      key: 'referenceImages',
      question: 'Would you like to share reference images?',
      prompt: 'Optional. Choose, drop, or paste up to three JPEG, PNG, or WebP images. Each must be 2 MB or smaller, with 5 MB combined.',
      type: 'file',
      label: 'Reference images'
    },
    {
      key: 'name',
      question: 'What should we call you?',
      prompt: 'Just your name is fine.',
      type: 'text',
      label: 'Your name',
      placeholder: 'Your name',
      required: true,
      minLength: 2,
      maxLength: 100
    },
    {
      key: 'email',
      question: 'Where can we email you?',
      prompt: 'We’ll use your email to reply to this inquiry.',
      type: 'email',
      label: 'Email address',
      placeholder: 'you@example.com',
      required: true,
      maxLength: 254
    }
  );
  return steps;
}

function getReferenceImageError(files) {
  if (files.length > MAX_REFERENCE_IMAGES) {
    return 'Choose no more than three images.';
  }
  if (files.some((file) => file.size > MAX_REFERENCE_IMAGE_BYTES ||
      !REFERENCE_IMAGE_TYPES.includes(file.type))) {
    return 'Choose JPEG, PNG, or WebP images, each 2 MB or smaller.';
  }
  if (files.reduce((total, file) => total + file.size, 0) > MAX_REFERENCE_TOTAL_BYTES) {
    return 'The selected images must total 5 MB or less.';
  }
  return '';
}

function reportFileError(control, message) {
  control.setCustomValidity(message);
  control.reportValidity();
  control.setCustomValidity('');
}

function createField(step) {
  if (step.type === 'choices') {
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'contact-choice-fieldset';
    const legend = document.createElement('legend');
    legend.className = 'sr-only';
    legend.textContent = step.question;
    fieldset.append(legend);

    const choices = document.createElement('div');
    choices.className = 'contact-choice-options';
    step.options.forEach((option, index) => {
      const label = document.createElement('label');
      label.className = 'contact-choice-option';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = step.key;
      input.value = option.value;
      input.required = index === 0;
      input.checked = state[step.key] === option.value;
      const text = document.createElement('span');
      text.textContent = option.label;
      label.append(input, text);
      choices.append(label);
    });
    fieldset.append(choices);
    return fieldset;
  }

  if (step.type === 'file') {
    const label = document.createElement('label');
    label.className = 'contact-field contact-step-field';
    label.htmlFor = 'contact-referenceImages';
    const labelText = document.createElement('span');
    labelText.textContent = step.label;
    const optional = document.createElement('small');
    optional.textContent = 'Optional';
    labelText.append(optional);
    label.append(labelText);
    const control = document.createElement('input');
    control.id = 'contact-referenceImages';
    control.name = 'referenceImages';
    control.type = 'file';
    control.accept = 'image/jpeg,image/png,image/webp';
    control.multiple = true;
    const selection = document.createElement('small');
    selection.className = 'contact-file-selection';
    selection.setAttribute('aria-live', 'polite');
    label.append(control, selection);
    let acceptedFiles = [...state.referenceImages];
    const assignFiles = (files) => {
      const transfer = new DataTransfer();
      files.forEach((file) => transfer.items.add(file));
      control.files = transfer.files;
      selection.textContent = files.length
        ? `${files.length} image${files.length === 1 ? '' : 's'} selected`
        : 'No images selected';
    };
    const acceptFiles = (files, append = false) => {
      const nextFiles = append ? [...control.files, ...files] : files;
      const error = getReferenceImageError(nextFiles);
      if (error) {
        reportFileError(control, error);
        return false;
      }
      acceptedFiles = nextFiles;
      assignFiles(acceptedFiles);
      control.setCustomValidity('');
      return true;
    };
    assignFiles(acceptedFiles);
    control.addEventListener('change', () => {
      const files = [...control.files];
      const error = getReferenceImageError(files);
      if (error) {
        reportFileError(control, error);
        assignFiles(acceptedFiles);
        return;
      }
      acceptedFiles = files;
      control.setCustomValidity('');
      assignFiles(acceptedFiles);
    });
    label.addEventListener('dragover', (event) => event.preventDefault());
    label.addEventListener('drop', (event) => {
      const files = [...(event.dataTransfer?.files || [])];
      if (!files.length) return;
      event.preventDefault();
      acceptFiles(files, true);
    });
    label.addEventListener('paste', (event) => {
      const files = [...(event.clipboardData?.items || [])]
        .filter((item) => item.kind === 'file')
        .map((item) => item.getAsFile())
        .filter(Boolean);
      if (!files.length) return;
      event.preventDefault();
      acceptFiles(files, true);
    });
    return label;
  }

  const label = document.createElement('label');
  label.className = 'contact-field contact-step-field';
  label.htmlFor = `contact-${step.key}`;
  const labelText = document.createElement('span');
  labelText.textContent = step.label;
  if (!step.required) {
    const optional = document.createElement('small');
    optional.textContent = 'Optional';
    labelText.append(optional);
  }
  label.append(labelText);

  const control = document.createElement(step.type === 'textarea' ? 'textarea' : 'input');
  control.id = `contact-${step.key}`;
  control.name = step.key;
  if (step.type !== 'textarea') control.type = step.type;
  if (step.type === 'textarea') control.rows = 4;
  if (step.minLength) control.minLength = step.minLength;
  if (step.maxLength) control.maxLength = step.maxLength;
  control.autocomplete = step.key === 'name' ? 'name' : (step.key === 'email' ? 'email' : 'off');
  control.placeholder = step.placeholder;
  control.required = Boolean(step.required);
  control.value = state[step.key];
  label.append(control);
  if (step.maxLength) {
    const counter = document.createElement('small');
    counter.className = 'contact-character-count';
    counter.id = `contact-${step.key}-count`;
    counter.setAttribute('aria-live', 'polite');
    control.setAttribute('aria-describedby', counter.id);
    const updateCount = () => {
      counter.textContent = `${control.value.length} / ${step.maxLength} characters`;
    };
    control.addEventListener('input', updateCount);
    updateCount();
    label.append(counter);
  }
  return label;
}

function renderStep(focusQuestion = false) {
  const steps = getSteps();
  const totalSteps = steps.length;
  currentStep = Math.max(0, Math.min(currentStep, steps.length - 1));
  const step = steps[currentStep];
  stepCount.textContent = `Step ${currentStep + 1} of ${totalSteps}`;
  progress.max = totalSteps;
  progress.value = currentStep + 1;
  backButton.hidden = currentStep === 0;
  nextButton.hidden = currentStep === steps.length - 1;
  submitButton.hidden = currentStep !== steps.length - 1;

  const eyebrow = document.createElement('p');
  eyebrow.className = 'contact-step-eyebrow';
  eyebrow.textContent = step.type === 'choices' ? 'Choose one' : (step.required ? 'Your details' : 'Optional');
  const question = document.createElement('h3');
  question.id = 'contactStepQuestion';
  question.tabIndex = -1;
  question.textContent = step.question;
  const prompt = document.createElement('p');
  prompt.className = 'contact-step-prompt';
  prompt.textContent = step.prompt;

  stepContent.replaceChildren(eyebrow, question, prompt, createField(step));
  contactStatus.textContent = '';
  contactStatus.removeAttribute('data-state');
  if (focusQuestion) question.focus({ preventScroll: true });
}

function saveCurrentStep() {
  const step = getSteps()[currentStep];
  if (step.type === 'choices') {
    const selected = stepContent.querySelector(`input[name="${step.key}"]:checked`);
    if (!selected) {
      stepContent.querySelector(`input[name="${step.key}"]`)?.reportValidity();
      return false;
    }
    if (step.key === 'topic' && state.topic !== selected.value) {
      state.eventType = '';
      state.eventOtherType = '';
      state.dessertType = '';
      state.dessertOtherType = '';
      state.apparelCategory = '';
      state.apparelOtherCategory = '';
      state.message = '';
    }
    if (step.key === 'eventType' && state.eventType !== selected.value) {
      state.eventOtherType = '';
    }
    if (step.key === 'dessertType' && state.dessertType !== selected.value) {
      state.dessertOtherType = '';
    }
    if (step.key === 'apparelCategory' && state.apparelCategory !== selected.value) {
      state.apparelOtherCategory = '';
    }
    state[step.key] = selected.value;
    return true;
  }

  const control = stepContent.querySelector(`[name="${step.key}"]`);
  if (step.type === 'file') {
    const files = [...(control?.files || [])];
    const error = getReferenceImageError(files);
    if (error) {
      reportFileError(control, error);
      return false;
    }
    state.referenceImages = files;
    return true;
  }
  if (!control || !control.reportValidity()) return false;
  const value = control.value.trim();
  if (step.key === 'message' && !value) {
    control.setCustomValidity('Please enter a message.');
    control.reportValidity();
    control.setCustomValidity('');
    return false;
  }
  if (step.key === 'name' && !namePattern.test(value)) {
    control.setCustomValidity('Use letters, numbers, spaces, apostrophes, hyphens, commas, periods, and ampersands only.');
    control.reportValidity();
    control.setCustomValidity('');
    return false;
  }
  if (['eventOtherType', 'dessertOtherType', 'apparelOtherCategory'].includes(step.key) && !value) {
    control.setCustomValidity('Please provide the requested detail.');
    control.reportValidity();
    control.setCustomValidity('');
    return false;
  }
  state[step.key] = value;
  return true;
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Unable to read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

async function buildPayload() {
  const details = {};
  if (state.topic === 'events') {
    details.eventType = state.eventType;
    if (state.eventType === 'Other') details.eventTypeOther = state.eventOtherType;
  } else if (state.topic === 'desserts') {
    details.dessertType = state.dessertType;
    if (state.dessertType === 'Other desserts') details.dessertTypeOther = state.dessertOtherType;
  } else if (state.topic === 'apparels') {
    details.apparelCategory = state.apparelCategory;
    if (state.apparelCategory === 'Other') {
      details.apparelCategoryOther = state.apparelOtherCategory;
    }
  }

  const referenceImages = await Promise.all(state.referenceImages.map(async (file) => ({
    name: file.name,
    data: await readAsDataUrl(file)
  })));
  return {
    type: state.topic,
    name: state.name,
    email: state.email,
    phone: '',
    message: state.message,
    details,
    referenceImages,
    captchaToken: state.captchaToken,
    website: document.getElementById('contactWebsite').value
  };
}

async function setupCaptcha() {
  const configuredBase = document.querySelector('meta[name="rafa-api-base"]')?.content.trim();
  const localBase = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? `${window.location.protocol}//${window.location.hostname}:3001`
    : '';
  const apiBase = (configuredBase || localBase).replace(/\/$/, '');
  const container = document.getElementById('contactCaptcha');
  try {
    const response = await fetch(`${apiBase}/public/inquiries/config`, { cache: 'no-store' });
    const config = await response.json().catch(() => ({}));
    if (!response.ok || !config.turnstileSiteKey) {
      throw new Error(config.message || 'The security check is not configured.');
    }
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (!window.turnstile) {
        captchaUnavailable = true;
        contactStatus.textContent = 'The security check could not be loaded. Please try again later.';
        contactStatus.dataset.state = 'error';
        return;
      }
      captchaWidgetId = window.turnstile.render(container, {
        sitekey: config.turnstileSiteKey,
        callback(token) {
          state.captchaToken = token;
          contactStatus.textContent = '';
          contactStatus.removeAttribute('data-state');
        },
        'expired-callback'() {
          state.captchaToken = '';
        },
        'error-callback'() {
          state.captchaToken = '';
          contactStatus.textContent = 'The security check failed to load. Please try again.';
          contactStatus.dataset.state = 'error';
        }
      });
    };
    script.onerror = () => {
      captchaUnavailable = true;
      contactStatus.textContent = 'The security check could not be loaded. Please try again later.';
      contactStatus.dataset.state = 'error';
    };
    document.head.append(script);
  } catch (error) {
    captchaUnavailable = true;
    contactStatus.textContent = error.message;
    contactStatus.dataset.state = 'error';
  }
}

backButton.addEventListener('click', () => {
  saveCurrentStep();
  currentStep -= 1;
  renderStep(true);
});

nextButton.addEventListener('click', () => {
  if (!saveCurrentStep()) return;
  currentStep += 1;
  renderStep(true);
});

contactForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submitted || !saveCurrentStep()) return;

  const controls = [...contactForm.querySelectorAll('input, textarea, button')];
  const disabledStates = controls.map((control) => control.disabled);
  controls.forEach((control) => {
    control.disabled = true;
  });
  submitButton.textContent = 'Sending...';
  contactStatus.textContent = 'Sending your inquiry...';
  contactStatus.dataset.state = 'sending';

  try {
    const configuredBase = document.querySelector('meta[name="rafa-api-base"]')?.content.trim();
    const localBase = ['localhost', '127.0.0.1'].includes(window.location.hostname)
      ? `${window.location.protocol}//${window.location.hostname}:3001`
      : '';
    const apiBase = (configuredBase || localBase).replace(/\/$/, '');
    if (captchaUnavailable) throw new Error('The security check is unavailable. Please try again later.');
    if (!state.captchaToken) throw new Error('Complete the security check before sending your inquiry.');
    const payload = await buildPayload();
    const response = await fetch(`${apiBase}/public/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || typeof result.data?.id !== 'string') {
      const message = Array.isArray(result.details) ? result.details.join(' ')
        : result.error?.message || result.message;
      throw new Error(message || 'The inquiry could not be saved.');
    }

    submitted = true;
    stepContent.hidden = true;
    actions.hidden = true;
    document.querySelector('.contact-stepper').hidden = true;
    contactStatus.textContent = 'Your inquiry was saved. The RAFA team will follow up using the details you provided.';
    contactStatus.dataset.state = 'success';
    document.getElementById('contactCaptcha').hidden = true;
  } catch (error) {
    console.error('Unable to submit the contact inquiry:', error);
    contactStatus.textContent = `${error.message} Your details are still here; please try again.`;
    contactStatus.dataset.state = 'error';
    state.captchaToken = '';
    if (captchaWidgetId !== null && window.turnstile) window.turnstile.reset(captchaWidgetId);
    controls.forEach((control, index) => {
      control.disabled = disabledStates[index];
    });
  } finally {
    submitButton.textContent = 'Send inquiry';
  }
});

renderStep();
setupCaptcha();
