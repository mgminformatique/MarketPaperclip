"use client";
import { useI18n } from "./i18n";
import React, { useState } from "react";
import Link from "./navigation-link";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Code2,
  FileCode2,
  Folder,
  LifeBuoy,
  LockKeyhole,
  Package,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { api, CopyButton, Empty, Notice } from "./market-ui";
import type { Session } from "./marketplace";
const example = `my-agent/\n├── README.md\n├── LICENSE\n├── manifest.json\n├── .env.example\n└── agents/\n    └── instructions.md`;
export function DocsPage() {
  const { t, locale } = useI18n();
  const [active, setActive] = useState("start");
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">{t("LE GUIDE DU CRÉATEUR")}</span>
        <h1>{t("De votre machine au marketplace.")}</h1>
        <p>
          {t(
            "Un guide clair pour créer des produits que d’autres développeurs peuvent réellement utiliser.",
          )}
        </p>
      </div>
      <div className="docs-layout">
        <nav aria-label={t("Documentation")} className="docs-nav">
          {t(
            [
              ["start", "Bien commencer"],
              ["package", "Préparer le package"],
              ["sell", "Publier et vendre"],
              ["buy", "Acheter et installer"],
              ["payments", "Paiements et licences"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={active === id ? "selected" : ""}
                aria-pressed={active === id}
                onClick={() => setActive(id)}
              >
                {t(label)}
                <ArrowRight size={14} />
              </button>
            )),
          )}
          <a
            href="https://docs.paperclip.ing/"
            target="_blank"
            rel="noreferrer"
          >
            {t("Documentation Paperclip ")}
            <ArrowUpRight size={14} />
          </a>
        </nav>
        <article className="prose panel">
          {/* Every tab is in the HTML (search engines and assistants read the
              whole guide); only the selected one is shown. */}
          {t(
            <>
              <section className="mk-docs-panel" hidden={active !== "start"}>
                <span className="docs-label">{t("01 / BIEN COMMENCER")}</span>
                <h2>{t("Le savoir-faire mérite un bon format.")}</h2>
                <p>
                  {t(
                    "MarketPaperclip est un marketplace indépendant de packages d’agents. Vous distribuez votre configuration, vos instructions, votre code et votre documentation. L’acheteur utilise le package dans son propre environnement.",
                  )}
                </p>
                <div className="doc-feature-grid">
                  <div>
                    <Code2 size={24} />
                    <h3>{t("Un agent")}</h3>
                    <p>
                      {t(
                        "Une mission précise, un comportement documenté, des limites connues.",
                      )}
                    </p>
                  </div>
                  <div>
                    <Package size={24} />
                    <h3>{t("Un bundle")}</h3>
                    <p>
                      {t(
                        "Plusieurs agents, leurs rôles et la manière dont ils travaillent ensemble.",
                      )}
                    </p>
                  </div>
                </div>
                <h3>{t("Trois étapes pour commencer")}</h3>
                <ol>
                  <li>
                    {t(
                      "Créez votre compte et personnalisez votre profil public.",
                    )}
                  </li>
                  <li>
                    {t(
                      "Préparez un package complet, testez-le sur une installation propre.",
                    )}
                  </li>
                  <li>
                    {t(
                      "Ouvrez le studio, créez votre fiche et envoyez-la en validation.",
                    )}
                  </li>
                </ol>
                <Link className="button primary" href="/studio/new">
                  {t("Créer mon produit ")}
                  <ArrowRight size={16} />
                </Link>
              </section>
              <section className="mk-docs-panel" hidden={active !== "package"}>
                <span className="docs-label">{t("02 / LE PACKAGE")}</span>
                <h2>{t("Un bon téléchargement se comprend tout seul.")}</h2>
                <p>
                  {t(
                    "Le marketplace accepte les archives ZIP et les manifestes JSON jusqu’à 20 Mo. Un manifeste JSON doit être un objet valide. Aucun fichier n’est exécuté par le marketplace.",
                  )}
                </p>
                <div className="code-block">
                  <div>
                    <span>{t("STRUCTURE CONSEILLÉE")}</span>
                    <CopyButton value={example} />
                  </div>
                  <pre>{t(example)}</pre>
                </div>
                <p>
                  {t(
                    "Cette arborescence est une convention de distribution conseillée, pas un schéma d’import officiel de Paperclip. Documentez le format réel et la version du runtime que vous avez testés.",
                  )}
                </p>
                <h3>{t("À inclure dans le README")}</h3>
                <ul>
                  <li>
                    {t(
                      "Mission de l’agent, exemples, résultats attendus et limites.",
                    )}
                  </li>
                  <li>
                    {t(
                      "Version de Paperclip, modèle et dépendances nécessaires.",
                    )}
                  </li>
                  <li>
                    {t(
                      "Permissions demandées : fichiers, réseau, comptes externes.",
                    )}
                  </li>
                  <li>
                    {t("Installation pas à pas et variables à configurer.")}
                  </li>
                  <li>
                    {t(
                      "Consommation du modèle, frais externes et méthode de désinstallation.",
                    )}
                  </li>
                </ul>
                <div className="info-callout">
                  {t(
                    "Livrez un fichier .env.example contenant uniquement les noms de variables. N’incluez jamais de clés API, de jetons, de mots de passe ni de données de clients.",
                  )}
                </div>
              </section>
              <section className="mk-docs-panel" hidden={active !== "sell"}>
                <span className="docs-label">{t("03 / PUBLIER")}</span>
                <h2>{t("Un studio pour vos idées.")}</h2>
                <p>
                  {t(
                    "Le studio vous permet de publier un agent individuel ou un bundle. Chaque fiche contient un nom, une description, des prérequis, un modèle principal, des tags, une version, une licence et un prix en dollars canadiens.",
                  )}
                </p>
                <h3>{t("Comment fonctionne la validation ?")}</h3>
                <p>
                  {t(
                    "Un produit commence en brouillon. Après le dépôt du fichier, vous pouvez le soumettre. L’administrateur examine le contenu, la documentation et les permissions avant de le publier ou de demander des corrections.",
                  )}
                </p>
                <h3>{t("Et les mises à jour ?")}</h3>
                <p>
                  {t(
                    "Une modification renvoie le produit en brouillon. Téléversez le package correspondant à la version affichée, puis soumettez-le à nouveau. Les acheteurs conservent l’accès au fichier de la version qu’ils ont achetée.",
                  )}
                </p>
                <h3>{t("Votre vitrine")}</h3>
                <p>
                  {t(
                    "Votre page créateur regroupe vos produits publiés. Vous choisissez votre nom public, votre identifiant, votre bio et votre lien de site web.",
                  )}
                </p>
              </section>
              <section className="mk-docs-panel" hidden={active !== "buy"}>
                <span className="docs-label">
                  {t("04 / ACHETER & INSTALLER")}
                </span>
                <h2>{t("Le bon agent, dans votre environnement.")}</h2>
                <ol>
                  <li>
                    {t(
                      "Consultez les prérequis et les coûts externes du produit.",
                    )}
                  </li>
                  <li>{t("Vérifiez la licence puis connectez-vous.")}</li>
                  <li>{t("Terminez le paiement sur la page Stripe.")}</li>
                  <li>
                    {t(
                      "Retrouvez la commande confirmée dans « Mes acquisitions ».",
                    )}
                  </li>
                  <li>
                    {t(
                      "Téléchargez le package et suivez les instructions du créateur.",
                    )}
                  </li>
                </ol>
                <p>
                  {t(
                    "Le téléchargement utilise un lien privé temporaire. Les fichiers sont accessibles seulement pour les achats confirmés et actifs. Une commande en cours de traitement peut prendre un moment à apparaître comme confirmée.",
                  )}
                </p>
                <div className="info-callout">
                  {t(
                    "Le marketplace distribue les packages; il n’héberge ni n’exécute vos agents. Inspectez le code et les permissions avant de l’installer dans votre environnement.",
                  )}
                </div>
              </section>
              <section className="mk-docs-panel" hidden={active !== "payments"}>
                <span className="docs-label">{t("05 / TRANSACTIONS")}</span>
                <h2>{t("Des transactions lisibles.")}</h2>
                <p>
                  {t(
                    "Stripe Connect relie le marketplace aux comptes vendeurs. Le vendeur complète la vérification demandée par Stripe avant de recevoir des paiements.",
                  )}
                </p>
                <h3>{t("Prix et commission")}</h3>
                <p>
                  {t(
                    "Chaque produit affiche un prix en CAD pour un paiement unique. La commission du marketplace apparaît dans le studio lorsqu’elle est configurée. Les taxes applicables, si activées, sont présentées au paiement.",
                  )}
                </p>
                <h3>{t("Les fichiers et la licence")}</h3>
                <p>
                  {t(
                    "La commande conserve la version, la licence, le prix et l’empreinte du fichier acheté. L’autorisation d’usage dépend de la licence choisie sur la fiche produit.",
                  )}
                </p>
                <h3>{t("Un problème avec un achat ?")}</h3>
                <p>
                  {t(
                    "Ouvrez une demande d’assistance depuis votre commande. Les demandes de remboursement sont examinées par un administrateur. Le statut est mis à jour à partir des confirmations Stripe.",
                  )}
                </p>
                <Link className="button secondary" href="/licenses">
                  {t("Lire les licences ")}
                  <ArrowUpRight size={15} />
                </Link>
              </section>
            </>,
          )}
        </article>
      </div>
    </>
  );
}
// Launch texts (3 November 2026), translated through lib/i18n/en.json. The
// commission paragraph states PLATFORM_FEE_BPS (1500 = 15 %): change both
// together. A nested array is rendered as a bulleted list.
type LegalSection = [title: string, body: (string | string[])[]];
const termsSections: LegalSection[] = [
  [
    "Un marketplace indépendant",
    [
      "MarketPaperclip est exploité par MGM Informatique (Québec, Canada). Il n’est pas un service officiel de Paperclip, d’Anthropic, d’OpenAI ou des autres fournisseurs cités.",
      "En créant un compte, en publiant ou en achetant sur MarketPaperclip, vous acceptez ces conditions. Dernière mise à jour : 3 novembre 2026.",
    ],
  ],
  [
    "Comptes",
    [
      "Vous devez fournir une adresse courriel valide, garder votre mot de passe confidentiel et être majeur, ou utiliser le service avec l’accord d’un parent ou d’un tuteur. Vous êtes responsable de l’activité de votre compte. Un compte qui enfreint ces conditions ou met d’autres personnes en danger peut être suspendu.",
    ],
  ],
  [
    "Des produits numériques",
    [
      "Les créateurs proposent des packages d’agents et des bundles, avec leur documentation, leur version et leur licence. Les agents s’exécutent dans l’environnement de l’acheteur : les services de modèles (API, abonnements) et d’infrastructure ne sont pas inclus, sauf mention explicite du créateur.",
    ],
  ],
  [
    "Responsabilités des créateurs",
    [
      "Le créateur doit disposer des droits nécessaires, décrire fidèlement les capacités et limites du produit, documenter ses permissions et ne publier aucun secret ni contenu malveillant.",
      "Chaque publication est examinée avant sa mise en ligne, et toute modification de son contenu repasse par cet examen. L’examen est humain : il ne constitue ni une certification ni une garantie de sécurité. Une annonce qui ne respecte pas ces règles peut être refusée ou retirée.",
    ],
  ],
  [
    "Prix, paiement et commission",
    [
      "Les prix sont fixés par les créateurs et affichés en dollars canadiens. Les taxes applicables, le cas échéant, sont indiquées avant le paiement. Le paiement est traité par Stripe : MarketPaperclip ne voit ni ne conserve vos données de carte.",
      "MarketPaperclip prélève une commission de 15 % sur le prix de chaque vente. Le reste est versé sur le compte Stripe du créateur, selon le calendrier de versement de Stripe. Pour vendre, le créateur active un compte Stripe Connect et accepte les conditions de Stripe.",
      "Une offre doit atteindre au moins 20 % du prix demandé. Une fois acceptée, elle peut être payée pendant 72 heures, au montant convenu.",
    ],
  ],
  [
    "Livraison",
    [
      "L’accès au téléchargement s’ouvre dès que Stripe confirme le paiement. La commande conserve la version et la licence achetées; les mises à jour futures ne sont pas incluses automatiquement. Les liens de téléchargement sont personnels et temporaires.",
    ],
  ],
  [
    "Remboursements",
    [
      "Les produits étant livrés immédiatement sous forme numérique, une vente n’est généralement pas remboursable. Un remboursement complet est toutefois accordé si le fichier est inutilisable, ne correspond pas substantiellement à sa description ou n’a pas pu être téléchargé : faites la demande à l’assistance dans les 14 jours suivant l’achat.",
      "Le remboursement est versé sur le moyen de paiement d’origine et retire l’accès au téléchargement. Une contestation de paiement suspend aussi cet accès jusqu’à sa résolution. Ces règles ne limitent pas les droits que vous accordent les lois sur la protection du consommateur.",
    ],
  ],
  [
    "Responsabilité",
    [
      "Les produits sont fournis par leurs créateurs. Lisez la documentation et la licence avant l’installation, et testez un agent dans un environnement adapté avant de lui confier des données ou des accès. Dans la mesure permise par la loi, MGM Informatique n’est pas responsable des dommages indirects liés à l’utilisation d’un produit.",
    ],
  ],
  [
    "Droit applicable et contact",
    ["Ces conditions sont régies par les lois applicables au Québec."],
  ],
];
const privacySections: LegalSection[] = [
  [
    "Qui est responsable",
    [
      "MarketPaperclip est exploité par MGM Informatique (Québec, Canada). La personne responsable de la protection des renseignements personnels est le propriétaire de MGM Informatique. Dernière mise à jour : 3 novembre 2026.",
    ],
  ],
  [
    "Ce que nous recueillons",
    [
      [
        "Compte : votre courriel et votre mot de passe (illisible pour nous : notre fournisseur d’authentification n’en conserve qu’une empreinte), ou le nom et le courriel transmis par Google si vous utilisez la connexion Google.",
        "Profil public : nom affiché, identifiant, bio, site web, photo, bannière et publications.",
        "Activité : annonces et fichiers publiés, commandes (parties, produit, version, licence, montant, statut), offres, avis, favoris et demandes d’assistance.",
        "Paiements : Stripe traite les cartes et les coordonnées bancaires; nous ne recevons que l’état des paiements et du compte vendeur.",
        "Données techniques : adresse IP et journaux du serveur, utilisés pour la sécurité et la limitation des abus.",
      ],
    ],
  ],
  [
    "Pourquoi nous les utilisons",
    [
      "Pour fournir le service (comptes, publications, achats, téléchargements), le modérer, prévenir la fraude et les abus, répondre à vos demandes et respecter nos obligations légales. Nous ne vendons pas vos renseignements.",
    ],
  ],
  [
    "Ce qui est public",
    [
      "Votre profil, vos publications, vos annonces et vos avis, avec votre nom affiché. Les statistiques du marché sont des agrégats : un acheteur n’est jamais identifié publiquement.",
    ],
  ],
  [
    "Fournisseurs et lieux de traitement",
    [
      "Supabase (base de données, authentification et fichiers) et Netlify (hébergement) traitent les données aux États-Unis. Stripe traite les paiements, Microsoft 365 envoie les courriels du service et Google n’intervient que si vous utilisez la connexion Google. Vos renseignements peuvent donc être conservés hors du Québec, chez des fournisseurs tenus de les protéger.",
    ],
  ],
  [
    "Cookies et stockage local",
    [
      "Les cookies de session servent à vous authentifier. Le choix de langue, les favoris sans connexion et les brouillons non publiés peuvent être conservés sur cet appareil. Aucun traceur publicitaire n’est ajouté par cette application.",
    ],
  ],
  [
    "Conservation",
    [
      "Les données du compte sont conservées tant que le compte existe, puis supprimées à la suite d’une demande de suppression. Les documents de transaction sont conservés pendant la durée exigée par les lois fiscales et comptables (en général six ans).",
    ],
  ],
  [
    "Vos droits",
    [
      "Vous pouvez demander l’accès à vos renseignements, leur correction, leur suppression ou leur transfert, et retirer votre consentement, en écrivant à la personne responsable ou par l’assistance. Nous répondons dans un délai de 30 jours. Vous pouvez aussi vous adresser à la Commission d’accès à l’information du Québec.",
    ],
  ],
  [
    "Sécurité",
    [
      "Connexions chiffrées (HTTPS), cookies de session protégés, accès aux données limité par des règles en base et paiements confiés à Stripe. En cas d’incident de confidentialité présentant un risque de préjudice sérieux, nous avisons les personnes concernées et la Commission d’accès à l’information.",
    ],
  ],
];
function LegalSections({
  sections,
  contact,
  contactAfter,
}: {
  sections: LegalSection[];
  contact: string;
  contactAfter: number;
}) {
  const { t } = useI18n();
  return (
    <>
      {sections.map(([title, body], i) => (
        <React.Fragment key={title}>
          {i === 0 ? <h2>{t(title)}</h2> : <h3>{t(title)}</h3>}
          {body.map((part) =>
            Array.isArray(part) ? (
              <ul key={part[0]}>
                {part.map((item) => (
                  <li key={item}>{t(item)}</li>
                ))}
              </ul>
            ) : (
              <p key={part}>{t(part)}</p>
            ),
          )}
          {i === contactAfter && (
            <p>
              {t(contact)}{" "}
              <a href="mailto:info@mgminformatique.ca">info@mgminformatique.ca</a>
              {t(", 514 816-0585 ou le ")}
              <Link href="/support">{t("formulaire d’assistance")}</Link>.
            </p>
          )}
        </React.Fragment>
      ))}
    </>
  );
}
export function LegalPage({
  path,
  session,
  signIn,
  notify,
}: {
  path: string;
  session: Session;
  signIn: () => void;
  notify: (s: string) => void;
}) {
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");
  async function support(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const orderId = new URLSearchParams(window.location.search).get("order");
      const d = await api("support", {
        subject: f.get("subject"),
        body: f.get("body"),
        order_id: orderId || null,
      });
      setSent(d.id);
      notify("Votre demande a été enregistrée.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (path === "/support")
    return (
      <>
        <div className="page-heading">
          <span className="eyebrow">{t("ON GARDE LE FIL")}</span>
          <h1>{t("Un coup de main pour la suite.")}</h1>
          <p>
            {t(
              "Une question sur une commande, un package ou votre compte ? Décrivez-nous la situation.",
            )}
          </p>
        </div>
        {t(
          !session.user ? (
            <Empty
              icon={LifeBuoy}
              title={t("Parlons de votre demande.")}
              action={
                <button className="button primary" onClick={signIn}>
                  {t("Me connecter")}
                </button>
              }
            >
              {t(
                "Connectez-vous pour créer une demande associée à votre compte.",
              )}
            </Empty>
          ) : sent ? (
            <Notice>
              {t("Demande enregistrée sous la référence ")}
              {t(sent.slice(0, 8))}
              {t(
                ". Elle est disponible dans la file de traitement du marketplace.",
              )}
            </Notice>
          ) : (
            <form className="panel form-stack support-form" onSubmit={support}>
              <label>
                {t("Sujet")}
                <input
                  name="subject"
                  required
                  minLength={3}
                  maxLength={150}
                  placeholder={t("Aide avec mon téléchargement")}
                />
              </label>
              <label>
                {t("Les détails")}
                <textarea
                  name="body"
                  required
                  minLength={20}
                  maxLength={5000}
                  rows={8}
                  placeholder={t(
                    "Le produit concerné, ce qui s’est passé et ce que vous attendez…",
                  )}
                />
              </label>
              {t(error && <Notice error>{t(error)}</Notice>)}
              <button className="button primary" disabled={busy}>
                {t(busy ? "Envoi…" : "Envoyer ma demande")}
                <ArrowRight size={16} />
              </button>
            </form>
          ),
        )}
      </>
    );
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">{t("CLARTÉ, AVANT TOUT")}</span>
        <h1>
          {t(
            path === "/licenses"
              ? "Le bon cadre pour créer."
              : path === "/privacy"
                ? "Vos données, avec mesure."
                : "Les règles du marketplace.",
          )}
        </h1>
      </div>
      <article className="prose panel legal-content">
        {t(
          path === "/licenses" ? (
            <>
              <h2>{t("Les licences proposées")}</h2>
              <p>
                {t(
                  "Chaque fiche indique la licence du package. Le fichier LICENSE livré par le créateur doit correspondre à cette sélection. Lisez-le avant l’installation.",
                )}
              </p>
              <h3>{t("MIT et Apache-2.0")}</h3>
              <p>
                {t(
                  "Les conditions sont celles du texte officiel de la licence livré avec le package. Le créateur doit posséder les droits nécessaires à sa redistribution et conserver les mentions applicables.",
                )}
              </p>
              <h3>{t("Commerciale — usage individuel")}</h3>
              <p>
                {t(
                  "Option destinée à une licence d’utilisation par un seul acheteur. Le créateur doit joindre un texte définissant les usages autorisés, les restrictions, les mises à jour et le support. Le simple libellé n’accorde pas de droits de redistribution.",
                )}
              </p>
              <h3>{t("Commerciale — équipe")}</h3>
              <p>
                {t(
                  "Option destinée à un usage au sein d’une équipe. Le créateur doit préciser le nombre d’utilisateurs, le périmètre autorisé et les restrictions dans le fichier LICENSE.",
                )}
              </p>
              <div className="info-callout">
                {t(
                  "Les modèles commerciaux sont des catégories de catalogue. Le texte contractuel exact du créateur doit être validé avant la mise en vente.",
                )}
              </div>
            </>
          ) : path === "/privacy" ? (
            <LegalSections
              sections={privacySections}
              contact="Pour la joindre :"
              contactAfter={0}
            />
          ) : (
            <LegalSections
              sections={termsSections}
              contact="Pour toute question :"
              contactAfter={termsSections.length - 1}
            />
          ),
        )}
      </article>
    </>
  );
}
