
UPDATE audit_copy_templates 
SET label = 'Website Performance – Description',
    content = 'When your website loads slow, jumps around, or feels unresponsive — potential customers leave and search engines take note. A website that stutters or hesitates sends people straight to your competitor.',
    updated_at = now()
WHERE section_key = 'metric_psi_desc';

UPDATE audit_copy_templates 
SET label = 'Ai Friendliness – Description',
    content = 'The way people search for local services is changing fast. ChatGPT, Siri, and Ai-powered search are becoming the place people go for recommendations. If your website isn''t built in a way those systems can read and understand, you''re invisible to them before the conversation even starts.',
    updated_at = now()
WHERE section_key = 'metric_ai_desc';
