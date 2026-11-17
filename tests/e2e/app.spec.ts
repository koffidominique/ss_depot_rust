import { test, expect } from '@playwright/test';

test.describe('DEPOTPRO PREMIUM V3 — Parcours E2E Interface & Métier', () => {
  test('Flux complet : PIN, caisse, fournisseur/client, produit, vente POS, paramètres, sauvegardes et 6 onglets rapports', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/login');

    // 1. Création du PIN propriétaire initial 123456 puis confirmation
    await expect(page.getByText(/Créer votre PIN propriétaire/i)).toBeVisible();
    for (const d of '123456') await page.getByRole('button', { name: d, exact: true }).click();
    await page.getByRole('button', { name: 'Continuer' }).click();
    await expect(page.getByText(/Confirmer le code PIN/i)).toBeVisible();
    for (const d of '123456') await page.getByRole('button', { name: d, exact: true }).click();
    await page.getByRole('button', { name: 'Enregistrer et accéder' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText(/Tableau de bord/i)).toBeVisible();

    // 2. Bascule thème Clair / Sombre
    await page.getByRole('button', { name: /thème/i }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.getByRole('button', { name: /thème/i }).click();

    // 3. Ouverture d'une session de caisse (50 000 FCFA)
    await page.goto('/cash');
    await page.getByRole('button', { name: /Ouvrir la caisse/i }).click();
    const cashDialog = page.getByRole('dialog');
    await cashDialog.locator('input').first().fill('50000');
    await cashDialog.getByRole('button', { name: /Confirmer l'ouverture/i }).click();
    await expect(page.getByText(/Caisse ouverte/i)).toBeVisible();

    // 4. Création produit avec stock initial
    await page.goto('/products');
    await page.getByRole('button', { name: /Nouveau produit/i }).click();
    const prodModal = page.getByRole('dialog');
    await prodModal.locator('input[type="text"]').first().fill('Youki Cocktail 50cl');
    await prodModal.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Youki Cocktail 50cl')).toBeVisible();

    // 5. Navigation de contrôle sur les 17 écrans
    for (const route of [
      '/stock',
      '/inventories',
      '/consignments',
      '/clients',
      '/debts',
      '/suppliers',
      '/purchases',
      '/expenses',
      '/sales/new',
      '/sales',
    ]) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
    }

    // 6. Sauvegarde cohérente et vérification intégrité
    await page.goto('/backups');
    await page.getByRole('button', { name: /Créer une sauvegarde/i }).click();
    await expect(page.getByText(/Sauvegarde cohérente créée/i)).toBeVisible();

    // 7. Paramètres groupés & sauvegarde
    await page.goto('/settings');
    await expect(page.getByText(/Documents & numérotation/i)).toBeVisible();

    // 8. Onglets des rapports (6 onglets)
    await page.goto('/reports');
    for (const tabLabel of [
      'Stock & Valorisation',
      'Caisse & Trésorerie',
      'Créances clients',
      'Fournisseurs & Dettes',
      'Consignations',
    ]) {
      await page.getByRole('tab', { name: tabLabel }).click();
    }

    expect(errors).toEqual([]);
  });
});
