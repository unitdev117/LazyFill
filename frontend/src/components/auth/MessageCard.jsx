import React from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../ui/Card';
import { Button } from '../ui/Button';

export function MessageCard({
  title,
  message,
  details = [],
  actionText,
  onAction,
  secondaryActionText,
  onSecondaryAction,
}) {
  return (
    <Card className="max-w-md mx-auto shadow-2xl border-white/10 bg-card/90 backdrop-blur-md">
      <CardHeader>
        <CardTitle className="text-xl font-bold text-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
        {details.map((detail) => (
          <div key={detail} className="rounded-2xl border border-white/5 bg-secondary/20 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            {detail}
          </div>
        ))}
      </CardContent>
      <CardFooter className="flex flex-col gap-3">
        <Button onClick={onAction} className="w-full font-semibold shadow-lg shadow-primary/20">
          {actionText}
        </Button>
        {secondaryActionText && (
          <Button variant="ghost" onClick={onSecondaryAction} className="w-full text-xs opacity-70 hover:opacity-100">
            {secondaryActionText}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
