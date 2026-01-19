import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useMFA } from '@/hooks/useMFA';
import { 
  Shield, 
  ShieldCheck, 
  ShieldOff, 
  Loader2, 
  Smartphone, 
  KeyRound,
  Copy,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';

export function TwoFactorSettings() {
  const {
    factors,
    loading,
    isEnrolling,
    enrollmentData,
    isMFAEnabled,
    startEnrollment,
    verifyEnrollment,
    removeFactor,
    cancelEnrollment,
  } = useMFA();

  const [verificationCode, setVerificationCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [factorToRemove, setFactorToRemove] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const handleStartSetup = async () => {
    await startEnrollment('MemeSniper Authenticator');
  };

  const handleVerify = async () => {
    if (!enrollmentData || verificationCode.length !== 6) {
      toast.error('Please enter a 6-digit code');
      return;
    }

    setIsVerifying(true);
    const success = await verifyEnrollment(enrollmentData.id, verificationCode);
    setIsVerifying(false);

    if (success) {
      setVerificationCode('');
    }
  };

  const handleRemove = (factorId: string) => {
    setFactorToRemove(factorId);
    setShowRemoveConfirm(true);
  };

  const confirmRemove = async () => {
    if (factorToRemove) {
      await removeFactor(factorToRemove);
      setFactorToRemove(null);
    }
    setShowRemoveConfirm(false);
  };

  const copySecret = () => {
    if (enrollmentData?.totp.secret) {
      navigator.clipboard.writeText(enrollmentData.totp.secret);
      setCopiedSecret(true);
      toast.success('Secret key copied');
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  return (
    <>
      <ConfirmDialog
        open={showRemoveConfirm}
        onOpenChange={setShowRemoveConfirm}
        title="Disable Two-Factor Authentication?"
        description="This will remove 2FA from your account. You can set it up again anytime, but your account will be less secure."
        confirmLabel="Disable 2FA"
        variant="destructive"
        onConfirm={confirmRemove}
      />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${isMFAEnabled ? 'bg-success/20' : 'bg-warning/20'}`}>
                {isMFAEnabled ? (
                  <ShieldCheck className="w-5 h-5 text-success" />
                ) : (
                  <Shield className="w-5 h-5 text-warning" />
                )}
              </div>
              <div>
                <CardTitle className="text-lg">Two-Factor Authentication</CardTitle>
                <CardDescription>
                  Add an extra layer of security to your account
                </CardDescription>
              </div>
            </div>
            <Badge 
              variant={isMFAEnabled ? 'default' : 'secondary'}
              className={isMFAEnabled ? 'bg-success/20 text-success border-success/30' : ''}
            >
              {isMFAEnabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          )}

          {/* MFA Already Enabled */}
          {!loading && isMFAEnabled && (
            <div className="space-y-4">
              <Alert className="bg-success/10 border-success/30">
                <ShieldCheck className="h-4 w-4 text-success" />
                <AlertDescription className="text-success">
                  Your account is protected with two-factor authentication.
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                {factors
                  .filter((f) => f.status === 'verified')
                  .map((factor) => (
                    <div
                      key={factor.id}
                      className="flex items-center justify-between p-3 bg-secondary/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Smartphone className="w-5 h-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium text-sm">{factor.friendly_name || 'Authenticator'}</p>
                          <p className="text-xs text-muted-foreground">
                            Added on {new Date(factor.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleRemove(factor.id)}
                      >
                        <ShieldOff className="w-4 h-4 mr-1" />
                        Remove
                      </Button>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Setup New 2FA */}
          {!loading && !isMFAEnabled && !enrollmentData && (
            <div className="space-y-4">
              <Alert className="bg-warning/10 border-warning/30">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <AlertDescription className="text-warning">
                  Your account is not protected with two-factor authentication.
                  We strongly recommend enabling it.
                </AlertDescription>
              </Alert>

              <div className="flex flex-col items-center gap-4 py-6">
                <div className="p-4 rounded-full bg-primary/10">
                  <KeyRound className="w-8 h-8 text-primary" />
                </div>
                <div className="text-center">
                  <p className="font-medium">Protect your account</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Use an authenticator app like Google Authenticator or Authy
                  </p>
                </div>
                <Button onClick={handleStartSetup} disabled={isEnrolling}>
                  {isEnrolling ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Shield className="w-4 h-4 mr-2" />
                  )}
                  Set Up 2FA
                </Button>
              </div>
            </div>
          )}

          {/* Enrollment Flow - QR Code */}
          {enrollmentData && (
            <div className="space-y-6">
              <div className="text-center space-y-4">
                <p className="font-medium">Scan this QR code with your authenticator app</p>
                
                {/* QR Code */}
                <div className="flex justify-center">
                  <div className="p-4 bg-white rounded-lg">
                    <img
                      src={enrollmentData.totp.qr_code}
                      alt="2FA QR Code"
                      className="w-48 h-48"
                    />
                  </div>
                </div>

                {/* Manual Entry */}
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Or enter this secret key manually:
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <code className="px-3 py-1.5 bg-secondary rounded text-sm font-mono">
                      {enrollmentData.totp.secret}
                    </code>
                    <Button variant="ghost" size="icon" onClick={copySecret}>
                      {copiedSecret ? (
                        <CheckCircle className="w-4 h-4 text-success" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Verification Code Input */}
              <div className="space-y-3">
                <Label htmlFor="verificationCode">Enter the 6-digit code from your app</Label>
                <div className="flex gap-2">
                  <Input
                    id="verificationCode"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="000000"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                    className="text-center text-lg tracking-widest font-mono"
                  />
                  <Button
                    onClick={handleVerify}
                    disabled={verificationCode.length !== 6 || isVerifying}
                  >
                    {isVerifying ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Verify'
                    )}
                  </Button>
                </div>
              </div>

              <Button variant="ghost" className="w-full" onClick={cancelEnrollment}>
                Cancel Setup
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
