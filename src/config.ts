import { z } from 'zod';

export const ExtensionConfigSchema = z.object({
  enable: z.boolean().prefault(true),
});
