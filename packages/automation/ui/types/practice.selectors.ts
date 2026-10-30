export const PracticeSelectors = {
  start: 'Start',
  finish: '#finish',
  checkbox: 'checkbox',
  dropdown: 'combobox',
  selected: 'option:checked',
  confirm: 'Click for JS Confirm',
  result: '#result',
  openWindow: 'Click Here',
  newWindow: 'New Window',
  windowHeading: 'Opening a new window',
  upload: '#file-upload',
  uploadButton: 'Upload',
  uploaded: '#uploaded-files',
  enable: 'Enable',
  input: '#input-example input',
} as const;
export const PracticeRoutes = {
  origin: 'https://the-internet.herokuapp.com',
  loading: '/dynamic_loading/1',
  checkboxes: '/checkboxes',
  dropdown: '/dropdown',
  alerts: '/javascript_alerts',
  windows: '/windows',
  upload: '/upload',
  controls: '/dynamic_controls',
} as const;
export const PracticeData = {
  option: '2',
  optionText: 'Option 2',
  fileName: 'hello.txt',
  fileBody: 'Assertide test file!\n',
  input: 'demo',
} as const;
