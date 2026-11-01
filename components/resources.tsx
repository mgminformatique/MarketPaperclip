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
        <span className="eyebrow">{t("THE BUILDER’S HANDBOOK")}</span>
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
          {t(
            active === "start" ? (
              <>
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
              </>
            ) : active === "package" ? (
              <>
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
              </>
            ) : active === "sell" ? (
              <>
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
              </>
            ) : active === "buy" ? (
              <>
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
              </>
            ) : (
              <>
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
              </>
            ),
          )}
        </article>
      </div>
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
            <>
              <h2>{t("Données utilisées par le service")}</h2>
              <p>
                {t(
                  "Le compte utilise votre courriel et votre identité de connexion. Votre nom public, votre identifiant, votre bio, votre site web et vos produits publiés sont visibles sur votre profil.",
                )}
              </p>
              <p>
                {t(
                  "Les commandes conservent les identifiants des parties, le produit, la version, la licence, le montant et le statut du paiement. Les informations de carte et les coordonnées bancaires sont gérées par Stripe.",
                )}
              </p>
              <h3>{t("Cookies et stockage local")}</h3>
              <p>
                {t(
                  "Les cookies de session servent à vous authentifier. Le choix de langue, les favoris sans connexion et les brouillons non publiés peuvent être conservés sur cet appareil. Aucun traceur publicitaire n’est ajouté par cette application.",
                )}
              </p>
              <h3>{t("Demandes concernant vos données")}</h3>
              <p>
                {t(
                  "Utilisez l’assistance pour une demande d’accès, de correction ou de suppression. Certaines données de transaction peuvent devoir être conservées selon les obligations applicables.",
                )}
              </p>
              <h3>{t("Avant l’ouverture commerciale")}</h3>
              <p>
                {t(
                  "Le responsable, les coordonnées de contact, les durées de conservation et les lieux de traitement seront précisés dans la politique de lancement. Les transactions restent fermées pendant cette avant-première.",
                )}
              </p>
            </>
          ) : (
            <>
              <h2>{t("Un marketplace indépendant")}</h2>
              <p>
                {t(
                  "MarketPaperclip est un projet de MGM Informatique. Il n’est pas présenté comme un service officiel de Paperclip, d’Anthropic, d’OpenAI ou des autres fournisseurs cités.",
                )}
              </p>
              <h3>{t("Des produits numériques")}</h3>
              <p>
                {t(
                  "Les créateurs proposent des packages d’agents et des bundles, avec leur documentation, leur version et leur licence. Les services de modèles et d’infrastructure ne sont pas inclus, sauf mention explicite du créateur.",
                )}
              </p>
              <h3>{t("Responsabilités des créateurs")}</h3>
              <p>
                {t(
                  "Le créateur doit disposer des droits nécessaires, décrire fidèlement les capacités et limites du produit, documenter ses permissions et ne publier aucun secret ni contenu malveillant.",
                )}
              </p>
              <h3>{t("Achats et assistance")}</h3>
              <p>
                {t(
                  "Les droits d’accès sont ouverts après confirmation du paiement. La version et la licence achetées sont conservées dans la commande. Un litige ou un remboursement peut suspendre le téléchargement. Les demandes sont transmises à l’assistance.",
                )}
              </p>
              <h3>{t("Version de lancement")}</h3>
              <p>
                {t(
                  "Les conditions commerciales définitives, les coordonnées de l’exploitant et la politique de remboursement doivent être complétées avant l’ouverture des ventes. Le catalogue de démonstration ne permet aucun achat.",
                )}
              </p>
            </>
          ),
        )}
      </article>
    </>
  );
}
