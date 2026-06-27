-- Admin role infrastructure.
-- Roles live in a DEDICATED table (not on `profiles`) so they can't be self-edited
-- via the existing "Users can update own profile" policy. There is no user-write
-- path here: only existing admins can grant/revoke roles.

CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER so the check runs with elevated rights: avoids RLS recursion
-- and lets both policies and edge functions verify roles safely.
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- Users may READ their own roles (the frontend guard needs this)...
CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- ...but only existing admins can WRITE roles. No self-promotion path from the client.
-- The first admin is seeded via the SQL Editor (superuser, bypasses RLS).
CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
