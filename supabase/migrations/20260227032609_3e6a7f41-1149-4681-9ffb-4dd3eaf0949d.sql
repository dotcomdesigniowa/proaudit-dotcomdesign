
CREATE TABLE public.audit_copy_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  section_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- RLS: only admins can read/write
ALTER TABLE public.audit_copy_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage copy templates"
  ON public.audit_copy_templates
  FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Allow anon/authenticated to read (needed for shared report)
CREATE POLICY "Anyone can read copy templates"
  ON public.audit_copy_templates
  FOR SELECT
  USING (true);

-- Seed all the variable text
INSERT INTO public.audit_copy_templates (section_key, label, content, sort_order) VALUES
-- Under the Hood: grade_provider
('uth_a', 'Under the Hood – Grade A', E'{{name}}''s website appears to be built on a strong technical foundation. It is performing well in the areas that most impact visibility, usability, and long term stability. From what we can see, the structure of the site supports search visibility, mobile performance, and accessibility in a way that positions the business well online.', 1),
('uth_a_plain', 'Under the Hood – Grade A – In Plain English', 'Your website is doing its job and is likely helping customers find and trust you online.', 2),
('uth_b', 'Under the Hood – Grade B', E'{{name}}''s website is in a solid position overall. The core technical structure is sound and it is performing well in the areas that matter most for online visibility and user experience. There are a few smaller technical items worth tightening up. Addressing them would improve consistency, reduce friction, and strengthen performance over time.', 3),
('uth_b_plain', 'Under the Hood – Grade B – In Plain English', 'Your website is working, but a few smart improvements could help you get even more out of it.', 4),
('uth_c', 'Under the Hood – Grade C', E'{{name}}''s website shows a mix of strengths and technical warning signs. While it is not in immediate crisis, there are structural issues that can begin to limit visibility and performance if left unaddressed. Over time, these types of issues can make it harder for customers to consistently find you online and easier for competitors to outrank you.', 5),
('uth_c_plain', 'Under the Hood – Grade C – In Plain English', 'Your website is not broken, but it is starting to hold you back and should be addressed before the issues grow.', 6),
('uth_d_branded', 'Under the Hood – Grade D – Hibu/Thryv', E'{{name}} appears to be a well established and reputable business with real credibility in the marketplace. However, the website and online presence do not reflect that same level of strength. The builder and platform currently powering the website introduce major structural limitations under the hood. While the site may look functional, the way it is built is creating serious visibility and performance problems.', 7),
('uth_d_branded_plain', 'Under the Hood – Grade D – Hibu/Thryv – In Plain English', 'The website you are currently paying for is likely limiting your online reach and making it harder for customers to consistently find you.', 8),
('uth_d_other', 'Under the Hood – Grade D – Other', E'{{name}} appears to be a well established and reputable business with real credibility in the marketplace. However, the website and online presence do not reflect that same level of strength. The current technical setup of the site shows major structural deficiencies under the hood. While the site may look functional on the surface, the way it is built is creating serious visibility and performance problems.', 9),
('uth_d_other_plain', 'Under the Hood – Grade D – Other – In Plain English', 'The website is likely limiting your online reach and making it harder for customers to consistently find you.', 10),
('uth_f_branded', 'Under the Hood – Grade F – Hibu/Thryv', E'{{name}} appears to be a well established and reputable business with real credibility in the marketplace. However, the website, online presence, and overall digital reputation do not reflect that same level of strength. The builder and platform currently powering the website introduce severe structural limitations under the hood. While the site may appear active, the way it is built is creating major visibility, performance, and trust issues.', 11),
('uth_f_branded_plain', 'Under the Hood – Grade F – Hibu/Thryv – In Plain English', 'Your current website setup is actively holding you back and making it difficult for customers to find and trust you online.', 12),
('uth_f_other', 'Under the Hood – Grade F – Other', E'{{name}} appears to be a well established and reputable business with real credibility in the marketplace. However, the website, online presence, and overall digital reputation do not reflect that same level of strength. The technical condition of the site shows severe structural deficiencies under the hood. While it may appear functional, the way it is built is creating major visibility, performance, and trust issues.', 13),
('uth_f_other_plain', 'Under the Hood – Grade F – Other – In Plain English', 'Your website is actively holding you back and reducing your ability to compete online.', 14),

-- Metric descriptions
('metric_w3c_desc', 'W3C – Description', E'Google doesn''t judge your website by how it looks but instead by the quality in which it''s built. So when your website is full of errors and warnings… trust declines. And when trust declines, your ability to show up online declines with it.', 20),
('metric_psi_desc', 'PSI Mobile – Description', 'Your mobile performance score directly impacts how your business shows up in search results. When your site is slow or underperforms on mobile, users leave… and Google notices. Over time, this drastically weakens your visibility.', 21),
('metric_accessibility_desc', 'Accessibility – Description', E'Modern standards require websites to be usable by everyone. When your site doesn''t meet those standards, it limits access, increases legal exposure, and weakens overall performance.', 22),
('metric_design_desc', 'Design – Description', 'Your website sets the first impression of your company. If it looks outdated, generic, or low quality, people assume your work is too. When trust drops, revenue follows.', 23),

-- Design bullets
('design_bullet_1', 'Design Bullet 1', 'Generic template-based design detected.', 30),
('design_bullet_2', 'Design Bullet 2', 'Design closely resembles other mass-produced local business sites.', 31),
('design_bullet_3', 'Design Bullet 3', 'Top-of-page section lacks strong trust signals.', 32),
('design_bullet_4', 'Design Bullet 4', 'Stock imagery and generic content detected.', 33),
('design_bullet_5', 'Design Bullet 5', 'Visual hierarchy and layout do not establish authority or credibility.', 34),
('design_bullet_6', 'Design Bullet 6', E'Website presentation does not reflect the quality of the company''s actual work.', 35),

-- Online Presence copy
('presence_default', 'Online Presence – Default', 'We also ran a comprehensive scan of your business across the internet and found a large list of issues across multiple platforms. To build trust, rank and get found, your entire digital presence must be structured, aligned, and optimized.', 40),
('presence_other', 'Online Presence – Other Provider', 'Is your overall online presence congruent, cohesive & consistent? Let us run a comprehensive scan of your business across the internet and we can find out! To build trust, rank and get found, your entire digital presence must be structured, aligned, and optimized.', 41),

-- CTA
('cta_title', 'CTA – Title', 'Want More Details?', 50),
('cta_body', 'CTA – Body', 'A brief call will allow us to walk through these findings in greater detail, show you exactly what we''re seeing, and answer any questions.', 51),

-- Overall score breakdown intro
('score_breakdown_intro', 'Score Breakdown – Intro', 'These metrics represent objective scores and signals that directly influence visibility, trust, reach and more. Scores were generated using neutral, reputable auditing platforms.', 60);
