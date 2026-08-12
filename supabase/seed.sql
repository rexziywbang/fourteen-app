-- Reference content. Safe to re-run.

insert into public.campuses (id, name, city, state, zip, email_domain) values
  ('umich',  'University of Michigan',  'ANN ARBOR',   'MI', '48104', 'umich.edu'),
  ('msu',    'Michigan State University','EAST LANSING','MI', '48824', 'msu.edu'),
  ('utexas', 'UT Austin',               'AUSTIN',      'TX', '78712', 'utexas.edu'),
  ('wisc',   'UW–Madison',              'MADISON',     'WI', '53706', 'wisc.edu'),
  ('nwu',    'Northwestern',            'EVANSTON',    'IL', '60208', 'northwestern.edu'),
  ('unc',    'UNC Chapel Hill',         'CHAPEL HILL', 'NC', '27599', 'unc.edu')
on conflict (id) do nothing;

-- The entire vocabulary a user can send. No free text, ever.
insert into public.crush_messages (text) values
  ('I''ve had a crush on you for a while now.'),
  ('I look for you every time I walk in.'),
  ('You make this place feel smaller in the best way.'),
  ('I think about our conversations after they end.'),
  ('I''d say yes if you asked.'),
  ('Somehow you''re always the highlight.'),
  ('I like you. It''s been distracting.'),
  ('If you guessed me, I''d be okay with it.'),
  ('You have no idea, and it''s kind of killing me.'),
  ('My week gets better when you''re in it.'),
  ('This is me being brave.')
on conflict (text) do nothing;

-- Content rule for anything added later: warm, funny, lightly flirty. Never
-- about appearance, bodies, ranking, or anything cruel. The test is whether
-- it would make their mom smile.
insert into public.poll_prompts (text) values
  ('Who''d text back at 3am?'),
  ('Who could talk their way out of a parking ticket?'),
  ('Who''s secretly the funniest person you know?'),
  ('Who''d say yes to coffee right now?'),
  ('Who gives the best advice at 1am?'),
  ('Who''d survive longest in a horror movie?'),
  ('Who''s most likely to end up teaching here?'),
  ('Who''d win campus-wide hide and seek?'),
  ('Who makes the dining hall bearable?'),
  ('Who do you want next to you in a group-project crisis?'),
  ('Who has the most contagious laugh?'),
  ('Who''d drop everything to get you from the airport?'),
  ('Who''s going to be famous one day?'),
  ('Who''d plan the perfect surprise party?'),
  ('Who could DJ a party with zero notice?'),
  ('Who''s the best study partner at 2am?'),
  ('Who''d share their fries without being asked?'),
  ('Who do you hope shows up when you walk in?'),
  ('Who''d win trivia night single-handedly?'),
  ('Who''s most likely to befriend a campus squirrel?'),
  ('Who''d help you move in the rain?'),
  ('Who sends the funniest texts?'),
  ('Who''d you trust to cut your hair?'),
  ('Who makes 8am lectures survivable?')
on conflict (text) do nothing;
