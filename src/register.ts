import type { ExtensionApi } from '@animalabs/connectome-host/src/extensions';
import { ExtensionConfigSchema } from './config';
import { buildStrategyOptions } from './options';
import { EXTENSION_BUILD, EXTENSION_NAME, EXTENSION_SEMVER } from './meta';
import {
  AutobiographicalStrategy,
  STRATEGY_NAME,
  StrategyConfigSchema,
} from './strategy';

async function register(api: ExtensionApi, rawConfig: Record<string, unknown>) {
  const { data: config, error } = ExtensionConfigSchema.safeParse(rawConfig ?? {});
  if (error) {
    throw new Error('Extension config invalid', { cause: error });
  }

  if (config.enable) {
    api.registerStrategy(STRATEGY_NAME, (ctx) => {
      const config = StrategyConfigSchema.parse(ctx.config);
      return new AutobiographicalStrategy(buildStrategyOptions(config, ctx.model) as ConstructorParameters<typeof AutobiographicalStrategy>[0]);
    });
  }
}

export default register;
export {
  EXTENSION_BUILD,
  EXTENSION_NAME,
  EXTENSION_SEMVER,
  register,
};
