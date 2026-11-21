import { test, expect, type Page } from '@playwright/test';

function trackRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

async function enterPinDigits(page: Page, pin: string) {
  for (const d of pin) {
    await page.getByRole('button', { name: d, exact: true }).click();
  }
}

async function loginWithPin(page: Page, pin: string, username?: string) {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Déverrouiller' })).toBeVisible();
  if (username) {
    await page.getByLabel(/Identifiant/i).fill(username);
  }
  await enterPinDigits(page, pin);
  await page.getByRole('button', { name: 'Déverrouiller' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Tableau de bord', level: 1 })).toBeVisible();
}

test.describe('DEPOTPRO PREMIUM V3 — Scénarios E2E Interface & Métier', () => {
  test.describe.configure({ mode: 'serial' });

  test('Scénario 1 — Initialisation PIN propriétaire, Tableau de bord & thème Clair/Sombre', async ({
    page,
  }) => {
    const errors = trackRuntimeErrors(page);

    await page.goto('/login');
    await expect(page.getByText('Créer votre PIN propriétaire')).toBeVisible();
    await enterPinDigits(page, '123456');
    await page.getByRole('button', { name: 'Continuer' }).click();

    await expect(page.getByText('Confirmer le code PIN')).toBeVisible();
    await enterPinDigits(page, '123456');
    await page.getByRole('button', { name: 'Enregistrer et accéder' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Tableau de bord', level: 1 })).toBeVisible();

    const themeToggle = page.getByRole('button', { name: /thème/i });
    await themeToggle.click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await themeToggle.click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);

    expect(errors).toEqual([]);
  });

  test('Scénario 2 — Ouverture de caisse, création produit et catalogue POS', async ({ page }) => {
    const errors = trackRuntimeErrors(page);
    await loginWithPin(page, '123456');

    await page.goto('/cash');
    await expect(page.getByRole('heading', { name: 'Session de caisse', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: /Ouvrir une session de caisse/i }).click();
    const cashDialog = page.getByRole('dialog');
    await cashDialog.locator('input').first().fill('50000');
    await cashDialog.getByRole('button', { name: "Confirmer l'ouverture" }).click();
    await expect(page.getByRole('heading', { name: /Session active/i })).toBeVisible();

    await page.goto('/products');
    await expect(
      page.getByRole('heading', { name: 'Catalogue produits & conditionnements', level: 1 })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Nouveau produit' }).click();
    const prodModal = page.getByRole('dialog');
    await prodModal.locator('input[type="text"]').first().fill('Youki Cocktail 50cl');
    await prodModal.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.locator('tbody').getByText('Youki Cocktail 50cl', { exact: true })).toBeVisible();

    await page.goto('/sales/new');
    await expect(
      page.getByRole('heading', { name: 'Nouvelle vente (Point de vente)', level: 1 })
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Youki Cocktail 50cl' })).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('Scénario 3 — Navigation multi-écrans, paramètres RBAC et rapports (6 onglets)', async ({
    page,
  }) => {
    const errors = trackRuntimeErrors(page);
    await loginWithPin(page, '123456');

    const routeHeadings: Array<[string, string]> = [
      ['/stock', 'Stocks & Mouvements'],
      ['/inventories', 'Inventaires physiques'],
      ['/consignments', 'Consignations & Emballages vides'],
      ['/clients', 'Clients & Politiques de crédit'],
      ['/debts', 'Créances clients'],
      ['/suppliers', 'Fournisseurs'],
      ['/purchases', 'Approvisionnements & Réceptions'],
      ['/expenses', 'Dépenses'],
      ['/sales', 'Historique des ventes'],
    ];

    for (const [route, heading] of routeHeadings) {
      await page.goto(route);
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    }

    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Paramètres généraux', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Documents & numérotation' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Opérateurs & Rôles/i })).toBeVisible();

    await page.goto('/reports');
    await expect(
      page.getByRole('heading', { name: 'Rapports & Indicateurs financiers', level: 1 })
    ).toBeVisible();
    for (const tabLabel of [
      'Stock & Valorisation',
      'Caisse & Trésorerie',
      'Créances clients',
      'Fournisseurs & Dettes',
      'Consignations',
    ]) {
      const tab = page.getByRole('tab', { name: tabLabel });
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
    }

    expect(errors).toEqual([]);
  });

  test('Scénario 4 — Sauvegardes SQLite cohérentes et sauvegarde chiffrée AES-256-GCM (.dpbkp)', async ({
    page,
  }) => {
    const errors = trackRuntimeErrors(page);
    await loginWithPin(page, '123456');

    await page.goto('/backups');
    await expect(
      page.getByRole('heading', { name: 'Sauvegardes & Restauration', level: 1 })
    ).toBeVisible();

    await page.getByRole('button', { name: 'Créer une sauvegarde maintenant' }).click();
    await expect(page.getByRole('cell', { name: /depotpro_backup_.*\.db$/i }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Sauvegarde chiffrée' }).click();
    await page.getByLabel('Phrase secrète de chiffrement').fill('DepotPro!2026');
    await page.getByRole('button', { name: 'Chiffrer et sauvegarder' }).click();
    await expect(
      page.getByText(/depotpro_backup_.*\.dpbkp$/i).first()
    ).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('Scénario 5 — Lot 8 : Multi-viewports (1440x900, 768x1024, 390x844), tiroir mobile, tri DataTable et raccourcis POS', async ({
    page,
  }) => {
    const errors = trackRuntimeErrors(page);

    const assertNoHorizontalOverflow = async (label: string) => {
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(overflow.scrollWidth, `${label} overflow`).toBeLessThanOrEqual(overflow.innerWidth);
    };

    // 1. Desktop 1440x900 : login, tri DataTable, recherche & raccourcis POS (F2 / Escape)
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginWithPin(page, '123456');
    await assertNoHorizontalOverflow('desktop-dashboard');

    await page.goto('/products');
    await expect(
      page.getByRole('heading', { name: 'Catalogue produits & conditionnements', level: 1 })
    ).toBeVisible();
    await assertNoHorizontalOverflow('desktop-products');

    // Tri de colonne DataTable
    const sortProductBtn = page.getByRole('button', { name: 'Produit', exact: true });
    await sortProductBtn.click();
    await sortProductBtn.click();

    await page.goto('/sales/new');
    await expect(
      page.getByRole('heading', { name: 'Nouvelle vente (Point de vente)', level: 1 })
    ).toBeVisible();
    await assertNoHorizontalOverflow('desktop-sales');

    // F2 focalise le champ de recherche POS + bouton effacer
    await page.keyboard.press('F2');
    const posSearch = page.getByPlaceholder(/Scanner code-barres ou chercher \(F2\)/i);
    await expect(posSearch).toBeFocused();
    await posSearch.fill('Youki');
    await page.getByRole('button', { name: 'Effacer la recherche', exact: true }).click();
    await expect(posSearch).toHaveValue('');

    // Ouverture modale client rapide puis fermeture via Escape
    await page.getByRole('button', { name: 'Créer rapidement un client', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();

    // 2. Tablette 768x1024
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Tableau de bord', level: 1 })).toBeVisible();
    await assertNoHorizontalOverflow('tablet-dashboard');

    await page.goto('/sales/new');
    await assertNoHorizontalOverflow('tablet-sales');

    // 3. Mobile 390x844 : tiroir de navigation mobile
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await assertNoHorizontalOverflow('mobile-dashboard');

    await page.getByRole('button', { name: 'Ouvrir le menu de navigation', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Fermer le menu', exact: true })).toBeVisible();
    await page.locator('aside:visible').getByRole('link', { name: 'Clients', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Clients & Politiques de crédit', level: 1 })
    ).toBeVisible();
    await assertNoHorizontalOverflow('mobile-clients');

    expect(errors).toEqual([]);
  });

  test('Scénario 6 — Commandes mixtes (casier partagé 12+12), modification brouillon, livraison & retour casier', async ({
    page,
  }) => {
    const errors = trackRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginWithPin(page, '123456');

    const loginRes = await page.request.post('/api/auth/login', { data: { pin: '123456' } });
    expect(loginRes.ok()).toBeTruthy();
    const { token } = (await loginRes.json()) as { token: string };
    const authHeaders = { Authorization: `Bearer ${token}` };

    const catRes = await page.request.get('/api/categories', { headers: authHeaders });
    expect(catRes.ok()).toBeTruthy();
    const cats = (await catRes.json()) as Array<{ id: number }>;
    const catId = cats[0].id;

    const makeProd = async (name: string, sku: string) => {
      const res = await page.request.post('/api/products', {
        headers: authHeaders,
        data: {
          name,
          category_id: catId,
          base_unit: 'bouteille',
          initial_stock: 100,
          purchase_price: 300,
          wholesale_price: 400,
          retail_price: 400,
          sku,
          variant: {
            name,
            sku: `${sku}-VAR`,
            volume_ml: 330,
            container_type: 'glass_returnable',
            container_returnable: true,
          },
        },
      });
      expect(res.ok()).toBeTruthy();
      const data = (await res.json()) as { variant_id: number };
      return data.variant_id;
    };

    const bockVarId = await makeProd('Bock 33cl E2E', 'BOCK-E2E');
    const drogbaVarId = await makeProd('Drogba 33cl E2E', 'DROGBA-E2E');

    await page.goto('/orders');
    await expect(
      page.getByRole('heading', { name: /Prise de commande clientèle/i, level: 1 })
    ).toBeVisible();

    // Étape 1 : création rapide client
    await page.getByRole('button', { name: 'Nouveau client rapide' }).click();
    await page.getByPlaceholder('Nom client *').fill('Maquis E2E Plateau');
    await page.getByRole('button', { name: 'Créer', exact: true }).click();
    await expect(page.getByText(/Solde consigné en cours — Maquis E2E Plateau/i)).toBeVisible();
    await page.getByRole('button', { name: 'Suivant' }).click();

    // Étape 2 : casier mixte (12 Bock 33cl + 12 Drogba 33cl)
    await page.getByRole('button', { name: '+ Ajouter un casier mixte' }).click();
    const variantSelects = page.locator('select').filter({ hasText: 'Bock 33cl E2E' });
    await variantSelects.nth(0).selectOption(String(bockVarId));
    await variantSelects.nth(1).selectOption(String(drogbaVarId));
    await page.getByRole('button', { name: 'Suivant' }).click();

    // Étape 3 : 1 seul casier physique 24x33cl alloué (1 000 FCFA)
    await expect(page.getByText('Casier 24 × 33cl verre').first()).toBeVisible();
    await expect(page.getByText(/1[\s\u202f]*000\s*FCFA/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Suivant' }).click();

    // Étape 4 : récapitulatif CA vs Consigne
    await expect(page.getByText(/9[\s\u202f]*600\s*FCFA/).first()).toBeVisible();
    await expect(page.getByText(/10[\s\u202f]*600\s*FCFA/).first()).toBeVisible();
    await page.getByPlaceholder('Zone / quartier / point de livraison...').fill('Plateau Rue 12');
    await page.getByRole('button', { name: 'Valider la commande' }).click();

    // Étape 5 : brouillon -> modification -> confirmation -> livraison -> encaissement -> retour casier
    await expect(page.getByText(/Commande #ORD-.*\(DRAFT\)/)).toBeVisible();
    await page.getByRole('button', { name: 'Modifier brouillon' }).click();
    await page.getByRole('button', { name: 'Suivant' }).click();
    await page.getByRole('button', { name: 'Suivant' }).click();
    await page.getByRole('button', { name: 'Mettre à jour le brouillon' }).click();
    await expect(page.getByText(/Commande #ORD-.*\(DRAFT\)/)).toBeVisible();

    await page.getByRole('button', { name: 'Confirmer (déduire stock)' }).click();
    await expect(page.getByText(/\(CONFIRMED\)/)).toBeVisible();

    await page.getByRole('button', { name: 'Livrer (imputer consignes client)' }).click();
    await expect(page.getByText(/\(DELIVERED\)/)).toBeVisible();

    await page.getByRole('button', { name: /Encaisser solde/i }).click();
    await expect(page.getByText(/\(PAID\)/)).toBeVisible();

    await page.getByRole('button', { name: /Retourner 1 Casier 24 × 33cl verre/i }).click();
    await expect(
      page.getByRole('button', { name: /Retourner 1 Casier 24 × 33cl verre/i })
    ).toBeHidden();

    expect(errors).toEqual([]);
  });

  test('Scénario 7 — Catalogue brasseries (60 produits dont Valpierre), anti-doublon et suppression Owner', async ({
    page,
  }) => {
    const errors = trackRuntimeErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginWithPin(page, '123456');

    await page.goto('/products');
    await expect(
      page.getByRole('heading', { name: 'Catalogue produits & conditionnements', level: 1 })
    ).toBeVisible();

    // 1. Ouverture catalogue brasseries (60 produits : 30 SOLIBRA + 30 BRASSIVOIRE)
    await page.getByRole('button', { name: 'Catalogue brasseries', exact: true }).click();
    const presetsDialog = page.getByRole('dialog');
    await expect(
      presetsDialog.getByRole('button', { name: 'Toutes (60)', exact: true })
    ).toBeVisible();
    await expect(
      presetsDialog.getByRole('button', { name: 'SOLIBRA (30)', exact: true })
    ).toBeVisible();
    await expect(
      presetsDialog.getByRole('button', { name: 'BRASSIVOIRE (30)', exact: true })
    ).toBeVisible();

    await presetsDialog.getByRole('button', { name: 'Vins & Spiritueux', exact: true }).click();
    await expect(
      presetsDialog.getByText('Vin Valpierre Rouge 75cl', { exact: true })
    ).toBeVisible();
    await presetsDialog
      .getByLabel('Sélectionner Vin Valpierre Rouge 75cl', { exact: true })
      .check();
    await presetsDialog
      .getByRole('button', { name: 'Activer la sélection (1)', exact: true })
      .click();

    await expect(
      page.locator('tbody').getByText('Vin Valpierre Rouge 75cl', { exact: true })
    ).toBeVisible();

    // 2. Détection d'un doublon en direct dans la modale Nouveau produit + vérification API 409
    await page.getByRole('button', { name: 'Nouveau produit', exact: true }).click();
    const formDialog = page.getByRole('dialog');
    await formDialog.locator('#product-name').fill('  vin valpierre   rouge 75cl ');
    await expect(
      formDialog.getByText(/Doublon détecté : « Vin Valpierre Rouge 75cl »/i)
    ).toBeVisible();
    await formDialog.getByRole('button', { name: 'Annuler', exact: true }).click();

    const loginRes = await page.request.post('/api/auth/login', { data: { pin: '123456' } });
    expect(loginRes.ok()).toBeTruthy();
    const { token } = (await loginRes.json()) as { token: string };
    const authHeaders = { Authorization: `Bearer ${token}` };

    const catsRes = await page.request.get('/api/categories', { headers: authHeaders });
    const cats = (await catsRes.json()) as Array<{ id: number }>;
    const dupRes = await page.request.post('/api/products', {
      headers: authHeaders,
      data: {
        name: 'VIN VALPIERRE ROUGE 75CL',
        category_id: cats[0].id,
        base_unit: 'bouteille',
        retail_price: 2500,
      },
    });
    expect(dupRes.status()).toBe(409);

    // 3. Suppression définitive réservée au Propriétaire (produit vierge sans ventes/achats)
    await page
      .getByRole('button', { name: 'Supprimer Vin Valpierre Rouge 75cl', exact: true })
      .click();
    const deleteDialog = page.getByRole('dialog');
    await expect(
      deleteDialog.getByText(/Supprimer définitivement Vin Valpierre Rouge 75cl/i)
    ).toBeVisible();
    await deleteDialog
      .getByRole('button', { name: 'Supprimer définitivement', exact: true })
      .click();
    await expect(
      page.locator('tbody').getByText('Vin Valpierre Rouge 75cl', { exact: true })
    ).toBeHidden();

    expect(errors).toEqual([]);
  });
});
