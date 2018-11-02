# load-git

Load git repository's file to local.

## Example

```typescript
import { load } from 'load-git';

load({ url: '', accessToken:'', branch:'master' })
  .then((res)=>{
    console.info(res);
  });
```