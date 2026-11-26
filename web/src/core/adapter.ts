/**
 * The ONE place that knows which core is bundled.
 * vite.config.ts aliases 'core-impl' to src/core/mock.ts, or to ../core/src/index.ts when CORE=real.
 * If the real core uses different names, map them here.
 */
import * as impl from 'core-impl';
import type { CoreAPI } from './contract';

export const core: CoreAPI = {
  compress: impl.compress,
  decompress: impl.decompress,
  pdaTrace: impl.pdaTrace,
};

export const isMock: boolean = (impl as { IS_MOCK?: boolean }).IS_MOCK === true;
