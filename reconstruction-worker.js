import { reconstruct } from './reconstruction.mjs';
self.onmessage = ({data}) => {
  try {
    const model = reconstruct(data.views);
    self.postMessage({model}, [model.vertices.buffer, model.triangles.buffer]);
  } catch(error) { self.postMessage({error:error.message}); }
};
