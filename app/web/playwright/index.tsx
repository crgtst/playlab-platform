import { beforeMount } from '@playwright/experimental-ct-react/hooks';
import '../src/styles.css';
import { ComponentHarness, HarnessConfig } from '../src/testing/ComponentHarness';

// Every mounted component is wrapped in the app's providers. Pass options with
// mount(<Component />, { hooksConfig: { lang: 'ga', currency: 'GBP', bugs: ['missing-label'] } }).
beforeMount<HarnessConfig>(async ({ App, hooksConfig }) => (
  <ComponentHarness {...hooksConfig}>
    <App />
  </ComponentHarness>
));
