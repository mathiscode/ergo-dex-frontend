import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useContext,
} from 'react';
import {
  Button,
  Card,
  Grid,
  Input,
  Loading,
  Row,
  Spacer,
  Tag,
  Text,
  Note,
} from '@geist-ui/react';
import { Form, Field, FieldRenderProps } from 'react-final-form';
import { FORM_ERROR } from 'final-form';
import { AmmPool, swapVars } from 'ergo-dex-sdk';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowDown } from '@fortawesome/free-solid-svg-icons';
import {
  AssetAmount,
  BoxSelection,
  DefaultBoxSelector,
} from 'ergo-dex-sdk/build/module/ergo';
import { fromAddress } from 'ergo-dex-sdk/build/module/ergo/entities/publicKey';
import { DefaultSettings, WalletContext } from '../../context';
import { useGetAllPools } from '../../hooks/useGetAllPools';
import { PoolSelect } from '../PoolSelect/PoolSelect';
import {
  ERG_DECIMALS,
  MIN_NITRO,
  MIN_DEX_FEE,
  EXECUTION_MINER_FEE,
} from '../../constants/erg';
import { getButtonState } from './buttonState';
import { useSettings } from '../../context';
import { toast } from 'react-toastify';
import { useCheckPool } from '../../hooks/useCheckPool';
import { ergoTxToProxy } from 'ergo-dex-sdk/build/module/ergo';
import {
  calculateAvailableAmount,
  getBaseInputParameters,
} from '../../utils/walletMath';
import { ConnectWallet } from '../ConnectWallet/ConnectWallet';
import SwapSettings from './SwapSettings';
import { SwapExtremums } from 'ergo-dex-sdk/build/module/amm/math/swap';
import { isNil } from 'ramda';
import explorer from '../../services/explorer';
import { poolActions } from '../../services/poolActions';
import { renderFractions, parseUserInputToFractions } from '../../utils/math';
import { isEmpty } from 'ramda';
import { isZero } from '../../utils/numbers';
import { toFloat } from '../../utils/string';
import { SwapSummary } from './SwapSummary';
import { makeTarget, minSufficientValueForOrder } from '../../utils/ammMath';
import { renderPoolPrice } from '../../utils/price';
import { AssetInfo } from 'ergo-dex-sdk/build/module/ergo/entities/assetInfo';

interface SwapFormProps {
  pools: AmmPool[];
}

const SwapForm: React.FC<SwapFormProps> = ({ pools }) => {
  const { isWalletConnected, utxos } = useContext(WalletContext);
  const [{ minerFee, address: chosenAddress }] = useSettings();
  const [selectedPool, setSelectedPool] = useState<AmmPool | undefined>();
  const [inputAsset, setInputAsset] = useState<AssetInfo | undefined>();
  const [outputAsset, setOutputAsset] = useState<AssetInfo | undefined>();
  const [pivotalAmount, setPivotalAmount] = useState('');
  const [slippage, setSlippage] = useState(DefaultSettings.slippage);
  const [inputAmount, setInputAmount] = useState('');
  const [outputAmount, setOutputAmount] = useState('');
  const [availableAmount, setAvailableAmount] = useState({
    input: 0n,
    output: 0n,
  });
  const [minDexFee, setMinDexFee] = useState(String(MIN_DEX_FEE));
  const [nitro, setNitro] = useState(String(MIN_NITRO));
  const [currentSwapVars, setCurrentSwapVars] = useState<
    [number, SwapExtremums] | undefined
  >();
  const isPoolValid = useCheckPool(selectedPool);

  const updateSelectedPool = useCallback((pool: AmmPool) => {
    setSelectedPool(pool);
    setInputAsset(pool.x.asset);
    setInputAmount('');
    setOutputAmount('');
    setOutputAsset(pool.y.asset);
  }, []);

  useEffect(() => {
    if (isNil(selectedPool)) {
      updateSelectedPool(pools[0]);
    }
  }, [pools, selectedPool, updateSelectedPool]);

  const buttonStatus = useMemo(
    () =>
      getButtonState({
        inputAsset,
        outputAsset,
        inputAmountRaw: inputAmount,
        outputAmountRaw: outputAmount,
        chosenAddress,
        utxos,
        availableAmount,
      }),
    [
      inputAmount,
      outputAmount,
      inputAsset,
      outputAsset,
      chosenAddress,
      utxos,
      availableAmount,
    ],
  );

  useEffect(() => {
    if (isZero(minDexFee) || isZero(nitro)) {
      resetSwapForm();
      return;
    }

    if (selectedPool && inputAsset && inputAmount) {
      const { minOutput } = getBaseInputParameters(selectedPool, {
        inputAmount,
        inputAsset,
        slippage: Number(slippage),
      });

      const vars = swapVars(BigInt(minDexFee), Number(nitro), minOutput);
      if (!isNil(vars)) {
        setCurrentSwapVars(vars);
      }
    }
  }, [slippage, minDexFee, inputAmount, inputAsset, selectedPool, nitro]);

  useEffect(() => {
    if (isWalletConnected && inputAsset && outputAsset) {
      if (utxos) {
        setAvailableAmount({
          input: calculateAvailableAmount(inputAsset.id, utxos),
          output: calculateAvailableAmount(outputAsset.id, utxos),
        });
      }
    }
  }, [isWalletConnected, inputAsset, outputAsset, utxos]);

  const resetSwapForm = (): void => {
    setInputAmount('');
    setOutputAmount('');
    setCurrentSwapVars(undefined);
  };

  const updateInputAmount = useCallback(
    (
      outputAmount: string,
      outputAssetAmount: AssetInfo | undefined,
      inputAssetAmount: AssetInfo | undefined,
    ) => {
      if (
        selectedPool &&
        inputAssetAmount &&
        outputAssetAmount &&
        Number(outputAmount) > 0
      ) {
        const amount = selectedPool.inputAmount(
          new AssetAmount(
            outputAssetAmount,
            parseUserInputToFractions(outputAmount, outputAssetAmount.decimals),
          ),
          Number(slippage),
        );
        setInputAmount(
          renderFractions(amount?.amount ?? 0n, inputAssetAmount.decimals),
        );
      }
    },
    [selectedPool, slippage],
  );

  const updateOutputAmount = useCallback(
    (
      inputAmount: string,
      outputAssetAmount: AssetInfo | undefined,
      inputAssetAmount: AssetInfo | undefined,
    ) => {
      if (
        selectedPool &&
        inputAssetAmount &&
        outputAssetAmount &&
        Number(inputAmount) > 0
      ) {
        const amount = selectedPool.outputAmount(
          new AssetAmount(
            inputAssetAmount,
            parseUserInputToFractions(inputAmount, inputAssetAmount.decimals),
          ),
          Number(slippage),
        );
        setOutputAmount(
          renderFractions(amount?.amount ?? 0n, outputAssetAmount.decimals),
        );
      }
    },
    [selectedPool, slippage],
  );

  const handleSwitchAssets = useCallback(() => {
    setInputAsset(outputAsset);
    setOutputAsset(inputAsset);
    if (inputAmount === pivotalAmount) {
      setOutputAmount(pivotalAmount);
      updateInputAmount(pivotalAmount, inputAsset, outputAsset);
    } else {
      setInputAmount(pivotalAmount);
      updateOutputAmount(pivotalAmount, inputAsset, outputAsset);
    }
  }, [
    inputAmount,
    pivotalAmount,
    updateInputAmount,
    inputAsset,
    outputAsset,
    setInputAsset,
    setOutputAsset,
    setInputAmount,
    updateOutputAmount,
  ]);

  const getInputValue = (value: string, decimals: number) => {
    const currentValue = toFloat(value, decimals);

    if (isEmpty(currentValue.trim())) {
      resetSwapForm();
      return;
    }

    return currentValue;
  };

  const handleEnterInputTokenAmount = (value: string, decimals: number) => {
    const currentValue = getInputValue(value, decimals);

    if (inputAsset && selectedPool && currentValue) {
      setInputAmount(currentValue);
      setPivotalAmount(currentValue);
      updateOutputAmount(currentValue, outputAsset, inputAsset);
    }
  };

  const handleEnterOutputTokenAmount = (value: string, decimals: number) => {
    const currentValue = getInputValue(value, decimals);

    if (outputAsset && selectedPool && currentValue) {
      setOutputAmount(currentValue);
      setPivotalAmount(currentValue);
      updateInputAmount(currentValue, outputAsset, inputAsset);
    }
  };

  const handleFormSubmit = async () => {
    if (
      isWalletConnected &&
      selectedPool &&
      inputAsset &&
      outputAsset &&
      utxos?.length &&
      chosenAddress
    ) {
      const poolId = selectedPool.id;

      const { baseInput, baseInputAmount, minOutput } = getBaseInputParameters(
        selectedPool,
        {
          inputAmount,
          inputAsset: inputAsset,
          slippage: Number(slippage),
        },
      );

      const pk = fromAddress(chosenAddress)!;

      if (!isNil(currentSwapVars)) {
        const [dexFeePerToken, extremums] = currentSwapVars;
        const { maxDexFee } = extremums;

        const poolFeeNum = selectedPool.poolFeeNum;
        const minerFeeNErgs = parseUserInputToFractions(minerFee, ERG_DECIMALS);

        const networkContext = await explorer.getNetworkContext();

        const params = {
          pk,
          poolId,
          baseInput,
          minQuoteOutput: minOutput.amount,
          dexFeePerToken,
          quoteAsset: outputAsset.id,
          poolFeeNum,
        };

        const minNErgs = minSufficientValueForOrder(minerFeeNErgs, maxDexFee);
        const target = makeTarget(
          [new AssetAmount(inputAsset, baseInputAmount)],
          minNErgs,
        );

        const inputs = DefaultBoxSelector.select(utxos, target);

        if (inputs instanceof BoxSelection) {
          const txContext = {
            inputs,
            changeAddress: chosenAddress,
            selfAddress: chosenAddress,
            feeNErgs: minerFeeNErgs,
            network: networkContext,
          };

          const actions = poolActions(selectedPool);

          actions
            .swap(params, txContext)
            .then(async (tx) => {
              const proxyTx = ergoTxToProxy(tx);
              await ergo.submit_tx(proxyTx);
              toast.success('Transaction submitted');
            })
            .catch((err) => {
              if (err?.message) {
                toast.error(JSON.stringify(err.message));
                return;
              }
              toast.error(JSON.stringify(err));
            });
        } else {
          throw inputs.message;
        }
      }
    }
  };

  return (
    <Form
      onSubmit={handleFormSubmit}
      initialValues={{
        slippage,
        inputAmount: 0.0,
        outputAmount: 0.0,
        address: '',
        poolId: undefined,
        minDexFee: renderFractions(MIN_DEX_FEE, ERG_DECIMALS),
        nitro: MIN_NITRO,
      }}
      render={({ handleSubmit, errors = {} }) => (
        <form onSubmit={handleSubmit}>
          <Grid.Container gap={1}>
            <Grid xs={12}>
              <Text h4>Swap</Text>
            </Grid>
            <Grid xs={12} justify={'flex-end'}>
              <SwapSettings
                slippage={String(slippage)}
                minDexFee={minDexFee}
                nitro={nitro}
                onChangeSlippage={setSlippage}
                onChangeMinDexFee={setMinDexFee}
                onChangeNitro={setNitro}
              />
            </Grid>
            <Grid xs={24}>
              <Field name="poolId" component="select">
                {(props: FieldRenderProps<string>) => (
                  <PoolSelect
                    pools={pools}
                    value={selectedPool}
                    onChangeValue={updateSelectedPool}
                    inputProps={props.input}
                  />
                )}
              </Field>
            </Grid>
            <Spacer y={0.5} />
            {isPoolValid.isFetching && (
              <Grid xs={24}>
                <Spacer y={2} />
                <Loading>Validating selected pool...</Loading>
              </Grid>
            )}
            {!isPoolValid.isFetching && isPoolValid.result === false && (
              <Grid xs={24}>
                <Note type="error" label="error" filled>
                  This pool is invalid. Please select another one.
                </Note>
              </Grid>
            )}
            {!isPoolValid.isFetching && isPoolValid.result && (
              <>
                <Grid xs={24}>
                  <Text small={true} type={'secondary'}>
                    {renderPoolPrice(selectedPool!)}
                  </Text>
                </Grid>
                <Grid xs={24} direction="column">
                  <Field name="inputAmount">
                    {(props: FieldRenderProps<string>) => (
                      <>
                        <Row>
                          <Input
                            placeholder="0.0"
                            width="100%"
                            lang="en"
                            label={inputAsset?.name ?? ''}
                            {...props.input}
                            disabled={!inputAsset}
                            value={inputAmount}
                            onChange={({ currentTarget }) => {
                              if (
                                inputAsset?.decimals === 0 &&
                                /[,.]/.test(currentTarget.value)
                              ) {
                                return;
                              }

                              handleEnterInputTokenAmount(
                                currentTarget.value,
                                inputAsset?.decimals || 0,
                              );
                              props.input.onChange(currentTarget.value);
                            }}
                          />
                        </Row>
                        {props.meta.error && (
                          <Row>
                            <Text p small type="error">
                              {props.meta.error}
                            </Text>
                          </Row>
                        )}
                      </>
                    )}
                  </Field>
                </Grid>
                <Grid xs={24} justify="center">
                  <Tag
                    onClick={handleSwitchAssets}
                    type="success"
                    style={{ cursor: 'pointer' }}
                  >
                    <FontAwesomeIcon icon={faArrowDown} />
                  </Tag>
                </Grid>
                <Grid xs={24}>
                  <Field name="outputAmount">
                    {(props: FieldRenderProps<string>) => (
                      <Input
                        placeholder="0.0"
                        label={outputAsset?.name ?? ''}
                        width="100%"
                        {...props.input}
                        value={outputAmount}
                        onChange={({ currentTarget }) => {
                          if (
                            outputAsset?.decimals === 0 &&
                            /[,.]/.test(currentTarget.value)
                          ) {
                            return;
                          }

                          handleEnterOutputTokenAmount(
                            currentTarget.value,
                            outputAsset?.decimals || 0,
                          );
                          props.input.onChange(currentTarget.value);
                        }}
                      />
                    )}
                  </Field>
                </Grid>

                {currentSwapVars?.[1] && (
                  <Grid xs={24} direction="column" alignItems="flex-start">
                    <Text h5>Swap summary</Text>
                    <SwapSummary
                      minerFee={minerFee}
                      swapExremums={currentSwapVars[1]}
                    />
                  </Grid>
                )}
                <Grid xs={24} direction="column">
                  {errors[FORM_ERROR] && (
                    <Row>
                      <Text p small type="error">
                        {errors[FORM_ERROR]}
                      </Text>
                    </Row>
                  )}
                  <Row justify="center">
                    {!isWalletConnected ? (
                      <ConnectWallet />
                    ) : (
                      <Button
                        htmlType="submit"
                        disabled={
                          buttonStatus.isDisabled ||
                          Object.values(errors).length > 0
                        }
                      >
                        {buttonStatus.text}
                      </Button>
                    )}
                  </Row>
                </Grid>
              </>
            )}
          </Grid.Container>
        </form>
      )}
    />
  );
};

export const Swap: React.FC = (props) => {
  const pools = useGetAllPools();
  if (pools === undefined) {
    return (
      <Card>
        <Loading>Loading</Loading>
      </Card>
    );
  }

  return <SwapForm pools={pools} {...props} />;
};
