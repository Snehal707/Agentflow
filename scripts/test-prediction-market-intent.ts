import assert from 'node:assert/strict';

import {
  isAmbiguousPredictionMarketIntent,
  isPredictionMarketBrowseIntent,
  normalizePredictionMarketSpelling,
} from '../lib/prediction-market-intent';

assert.equal(normalizePredictionMarketSpelling('predcition market'), 'prediction market');
assert.equal(normalizePredictionMarketSpelling('Predicition Markets'), 'prediction Markets');
assert.equal(isAmbiguousPredictionMarketIntent('predcition market'), true);
assert.equal(isAmbiguousPredictionMarketIntent('prediction market'), true);
assert.equal(isAmbiguousPredictionMarketIntent('prediction markets'), true);
assert.equal(isAmbiguousPredictionMarketIntent('show prediction markets'), false);
assert.equal(isPredictionMarketBrowseIntent('show predcition markets'), true);
assert.equal(isPredictionMarketBrowseIntent('list predicition markets'), true);

console.log('prediction-market intent typo regressions passed.');
