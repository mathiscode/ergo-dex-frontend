import { Explorer } from 'ergo-dex-sdk';
import { ERGO_BASE_URL } from '../constants/env';

const explorer = new Explorer(ERGO_BASE_URL);

export default explorer;
