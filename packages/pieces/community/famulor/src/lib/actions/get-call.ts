import { createAction } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { famulorAuth } from '../common/auth';
import { famulorRequest, flattenCall } from '../common/client';
import { callDropdown } from '../common/props';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const getCall = createAction({
  auth: famulorAuth,
  name: 'getCall',
  displayName: 'Get Call',
  description: 'Retrieve one call by UUID, including transcript, summary, and recording URL.',
  props: {
    call_id: callDropdown(),
  },
  async run({ auth, propsValue }) {
    const callId = String(propsValue.call_id ?? '').trim();
    if (!uuidPattern.test(callId)) {
      throw new Error('Call ID must be a UUID.');
    }

    const response = await famulorRequest({
      auth,
      method: HttpMethod.GET,
      path: `/calls/${callId}`,
    });

    return flattenCall(response);
  },
});
