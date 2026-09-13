'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { HelpCircle } from 'lucide-react';
import { createOrganizationAction } from '@/app/actions/organization';
import { toast } from 'sonner';

export interface CreateOrganizationDialogProps {
  onSuccess?: () => void;
}

export function CreateOrganizationDialog({ onSuccess }: CreateOrganizationDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await createOrganizationAction(formData.name, formData.slug);

      if (result.ok) {
        toast.success('組織を作成しました');
        setFormData({ name: '', slug: '' });
        setIsOpen(false);
        onSuccess?.();
      } else {
        toast.error(result.error || '組織の作成に失敗しました');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '予期しないエラーが発生しました';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <Button onClick={() => setIsOpen(true)} variant="default">
        組織を作成
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>新しい組織を作成</CardTitle>
          <CardDescription>
            チーム用の新しい組織を作成します。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">組織名</Label>
              <Input
                id="name"
                name="name"
                placeholder="例: ACME Corp"
                value={formData.name}
                onChange={handleInputChange}
                disabled={isLoading}
                required
              />
            </div>

            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Label htmlFor="slug" className="mb-0">組織タグ（英数字）</Label>
                <TooltipProvider delay={0}>
                  <Tooltip>
                    <TooltipTrigger
                      type="button"
                      className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center rounded-full focus:outline-none cursor-pointer"
                      aria-label="組織タグの説明"
                    >
                      <HelpCircle className="h-4 w-4" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs p-2 text-xs">
                      組織タグはURLや組織の識別子として使用される一意の半角英数字・ハイフンです（例: acme-corp）。
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                id="slug"
                name="slug"
                placeholder="例: acme-corp"
                value={formData.slug}
                onChange={handleInputChange}
                disabled={isLoading}
                required
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOpen(false)}
                disabled={isLoading}
              >
                キャンセル
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? '作成中...' : '作成'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
