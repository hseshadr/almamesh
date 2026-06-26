import { useTranslation } from 'react-i18next';
import { LegalPageLayout } from './LegalPageLayout';

export default function TermsOfService() {
  const { t } = useTranslation('legal');

  return (
    <LegalPageLayout title={t('terms.title')} lastUpdated={t('terms.last_updated')}>
      <p>{t('terms.intro')}</p>

      <h2>{t('terms.s1_heading')}</h2>
      <p>{t('terms.s1_p1')}</p>

      <h2>{t('terms.s2_heading')}</h2>
      <p>{t('terms.s2_p1')}</p>

      <h2>{t('terms.s3_heading')}</h2>
      <p>
        <strong>{t('terms.s3_p1')}</strong>
      </p>
      <ul>
        <li>{t('terms.s3_li1')}</li>
        <li>{t('terms.s3_li2')}</li>
        <li>{t('terms.s3_li3')}</li>
        <li>{t('terms.s3_li4')}</li>
      </ul>
      <p>
        <strong>{t('terms.s3_p2')}</strong>
      </p>

      <h2>{t('terms.s4_heading')}</h2>
      <ul>
        <li>{t('terms.s4_li1')}</li>
        <li>{t('terms.s4_li2')}</li>
        <li>{t('terms.s4_li3')}</li>
        <li>{t('terms.s4_li4')}</li>
      </ul>

      <h2>{t('terms.s5_heading')}</h2>
      <p>{t('terms.s5_p1')}</p>
      <ul>
        <li>{t('terms.s5_li1')}</li>
        <li>{t('terms.s5_li2')}</li>
        <li>{t('terms.s5_li3')}</li>
      </ul>

      <h2>{t('terms.s6_heading')}</h2>
      <p>{t('terms.s6_p1')}</p>
      <ul>
        <li>{t('terms.s6_li1')}</li>
        <li>{t('terms.s6_li2')}</li>
        <li>{t('terms.s6_li3')}</li>
      </ul>

      <h2>{t('terms.s7_heading')}</h2>
      <ul>
        <li>{t('terms.s7_li1')}</li>
        <li>{t('terms.s7_li2')}</li>
        <li>{t('terms.s7_li3')}</li>
      </ul>

      <h2>{t('terms.s8_heading')}</h2>
      <p>{t('terms.s8_p1')}</p>
      <ul>
        <li>{t('terms.s8_li1')}</li>
        <li>{t('terms.s8_li2')}</li>
        <li>{t('terms.s8_li3')}</li>
        <li>{t('terms.s8_li4')}</li>
      </ul>

      <h2>{t('terms.s9_heading')}</h2>
      <p>{t('terms.s9_p1')}</p>

      <h2>{t('terms.s10_heading')}</h2>
      <p>{t('terms.s10_p1')}</p>

      <h2>{t('terms.s11_heading')}</h2>
      <p>{t('terms.s11_p1')}</p>

      <h2>{t('terms.s12_heading')}</h2>
      <p>{t('terms.s12_p1')}</p>

      <h2>{t('terms.s13_heading')}</h2>
      <p>
        {t('terms.s13_p1')} <a href="mailto:legal@almamesh.com">legal@almamesh.com</a>
      </p>
    </LegalPageLayout>
  );
}
