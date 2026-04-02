export const MIGRATION_ONBOARDING_KEY = 'hmg_migration_onboarding_completed';

export const isMigrationOnboardingCompleted = (user) => {
  try {
    const local = (typeof window !== 'undefined' && window.localStorage)
      ? localStorage.getItem(MIGRATION_ONBOARDING_KEY) === 'true'
      : false;
    const remote = Boolean(user?.user_metadata?.migration_onboarding_completed);
    return local || remote;
  } catch (error) {
    console.warn('Failed to access localStorage:', error);
    return Boolean(user?.user_metadata?.migration_onboarding_completed);
  }
};

export const markMigrationOnboardingLocal = () => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(MIGRATION_ONBOARDING_KEY, 'true');
    }
  } catch (error) {
    console.warn('Failed to set localStorage:', error);
  }
};